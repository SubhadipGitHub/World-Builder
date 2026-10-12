import { rates } from '../../config/rates';
import type { LaneGraph } from '../graph/laneGraph';
import type { AgentKind, Vec2 } from '../types';
import { advance, type IdmParams, type LeaderInfo } from './idm';
import { findLeader, type LeaderWorld, type Occupant } from './leader';
import { createZoneManager, type ZoneManager } from './zones';

export interface MoverSpec {
  readonly id: string;
  readonly kind: AgentKind;
  /** Edge ids, in driving order. */
  readonly route: readonly string[];
  readonly length: number;
  readonly width: number;
  readonly priority: number;
  readonly idm: IdmParams;
}

export interface MoverView {
  readonly id: string;
  readonly kind: AgentKind;
  readonly edgeId: string;
  /** Front bumper position along edgeId. */
  readonly s: number;
  readonly speed: number;
  /** Body centre in world space. */
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly length: number;
  readonly width: number;
  /** True once the front reached the end of the last route edge; the mover then stays parked there. */
  readonly finished: boolean;
}

/**
 * Lane-following traffic with conflict-zone reservations (architecture §4).
 * Invariant: no two movers' footprints ever overlap, and no mover stops inside a zone.
 */
export interface TrafficEngine {
  readonly zones: ZoneManager;
  readonly tick: number;
  /**
   * Places a mover with its front at s on route[0] (default s = length). Returns false
   * (and does nothing) if the body plus s0 either side is not clear, or the id already exists.
   */
  spawn(spec: MoverSpec, s?: number): boolean;
  /** Changes a mover's body length (e.g. a tow truck carrying a car); the front stays put. */
  setLength(id: string, length: number): void;
  /** True if any part of the mover's body is on the edge. False for unknown ids. */
  occupies(id: string, edgeId: string): boolean;
  /** World point `distance` behind the mover's front, measured along its route. Throws on unknown ids. */
  pointBehind(id: string, distance: number): Vec2;
  /** Advances all movers by dt wall seconds; speedFactor scales desired speed (weather). */
  step(dt: number, speedFactor?: number): void;
  movers(): readonly MoverView[];
  mover(id: string): MoverView | null;
  /** Removes a mover and releases any zones it holds. */
  remove(id: string): void;
  /** Replaces the route after the current edge; the new route must start with the current edge. */
  setRoute(id: string, route: readonly string[]): void;
  /** Adds a stop line identified by key (e.g. a bay gate). */
  addStopLine(key: string, edgeId: string, s: number): void;
  removeStopLine(key: string): void;
}

export interface TrafficOptions {
  /** Leader search distance in metres (default config rates.lookAheadM). */
  readonly lookAhead?: number;
}

/** Extra clear space required beyond a zone exit, on top of length + s0 (box rule). */
const BOX_MARGIN = 2;
/** Distance from the route end at which a slow mover is snapped to the end and parked. */
const FINISH_TOLERANCE = 0.05;
/**
 * The route end is treated as an obstacle this far beyond the end, so a mover arrives with a
 * little speed instead of creeping up asymptotically (IDM); moveAlong clamps it at the end.
 */
const END_OVERSHOOT = 0.6;
/** Past edges kept on a route so the rear of a long vehicle can still be located. */
const KEEP_PAST_EDGES = 3;

interface Mover {
  spec: MoverSpec;
  route: string[];
  idx: number;
  s: number;
  v: number;
  /** Total distance travelled since spawn (front bumper). */
  odo: number;
  finished: boolean;
  /** zoneId → odometer value at which the front reaches the zone exit. */
  readonly held: Map<string, number>;
  readonly requested: Set<string>;
  /** arrivedAt used for every zone in the chain being approached. */
  ticket: number | null;
}

/** A zone on the route, in distances from the mover's front. */
interface ZoneAhead {
  readonly zoneId: string;
  readonly enter: number;
  readonly exit: number;
}

export function createTrafficEngine(graph: LaneGraph, options?: TrafficOptions): TrafficEngine {
  const lookAhead = options?.lookAhead ?? rates.lookAheadM;
  const zones = createZoneManager(graph.zones.map((z) => z.id));
  const movers = new Map<string, Mover>();
  const stopLines = new Map<string, { edgeId: string; s: number }>();
  let tick = 0;
  let viewCache: MoverView[] | null = null;

  const len = (edgeId: string): number => graph.edge(edgeId).length;

  // ---------- geometry ----------

  function pointBehind(m: Mover, back: number): Vec2 {
    let k = m.idx;
    let s = m.s - back;
    while (s < 0 && k > 0) {
      k--;
      s += len(m.route[k] as string);
    }
    const path = graph.edge(m.route[k] as string).path;
    if (s >= 0) return path.pointAt(s);
    // Before the first known edge: extrapolate backwards along its start.
    const start = path.pointAt(0);
    const h = path.headingAt(0);
    return { x: start.x + Math.cos(h) * s, z: start.z + Math.sin(h) * s };
  }

  function view(m: Mover): MoverView {
    const front = pointBehind(m, 0);
    const rear = pointBehind(m, m.spec.length);
    return {
      id: m.spec.id,
      kind: m.spec.kind,
      edgeId: m.route[m.idx] as string,
      s: m.s,
      speed: m.v,
      x: (front.x + rear.x) / 2,
      z: (front.z + rear.z) / 2,
      heading: Math.atan2(front.z - rear.z, front.x - rear.x),
      length: m.spec.length,
      width: m.spec.width,
      finished: m.finished,
    };
  }

  /** Body spans of a mover per edge: [edgeId, from, to] along each edge. */
  function bodySpans(m: Mover): [string, number, number][] {
    const spans: [string, number, number][] = [];
    let k = m.idx;
    let front = m.s;
    let remaining = m.spec.length;
    for (;;) {
      const edgeId = m.route[k] as string;
      const from = Math.max(0, front - remaining);
      spans.push([edgeId, from, front]);
      remaining -= front - from;
      if (remaining <= 1e-9 || k === 0) break;
      k--;
      front = len(m.route[k] as string);
    }
    return spans;
  }

  function distanceToRouteEnd(m: Mover): number {
    let d = -m.s;
    for (let k = m.idx; k < m.route.length; k++) d += len(m.route[k] as string);
    return d;
  }

  // ---------- occupancy ----------

  /**
   * Every edge a mover's body covers, with its front projected onto that edge. A leader that
   * has turned onto an edge off the follower's route is still visible through its rear.
   */
  function occupancy(): Map<string, Occupant[]> {
    const occ = new Map<string, Occupant[]>();
    const add = (edgeId: string, o: Occupant): void => {
      const list = occ.get(edgeId);
      if (list) list.push(o);
      else occ.set(edgeId, [o]);
    };
    for (const m of movers.values()) {
      let k = m.idx;
      let front = m.s;
      add(m.route[k] as string, { id: m.spec.id, s: front, length: m.spec.length, speed: m.v });
      while (front - m.spec.length < 0 && k > 0) {
        k--;
        front += len(m.route[k] as string);
        add(m.route[k] as string, { id: m.spec.id, s: front, length: m.spec.length, speed: m.v });
      }
    }
    return occ;
  }

  function staticStops(): Map<string, number[]> {
    const out = new Map<string, number[]>();
    for (const { edgeId, s } of stopLines.values()) {
      const list = out.get(edgeId) ?? [];
      list.push(s);
      out.set(edgeId, list);
    }
    return out;
  }

  /** Walks the route ahead, calling visit(edgeId, offset) where offset = distance from front to edge start. */
  function walkAhead(m: Mover, horizon: number, visit: (edgeId: string, offset: number, isCurrent: boolean) => void): void {
    let offset = -m.s;
    for (let k = m.idx; k < m.route.length && offset <= horizon; k++) {
      const edgeId = m.route[k] as string;
      visit(edgeId, offset, k === m.idx);
      offset += len(edgeId);
    }
  }

  // ---------- zones ----------

  function zonesAhead(m: Mover, horizon: number): ZoneAhead[] {
    const out: ZoneAhead[] = [];
    walkAhead(m, horizon, (edgeId, offset) => {
      for (const { zone, interval } of graph.zonesOn(edgeId)) {
        const enter = offset + interval.sEnter;
        const exit = offset + interval.sExit;
        if (exit <= 1e-9) continue;
        const last = out[out.length - 1];
        if (last?.zoneId === zone.id && enter <= last.exit + 0.5) {
          out[out.length - 1] = { zoneId: zone.id, enter: last.enter, exit: Math.max(last.exit, exit) };
        } else {
          out.push({ zoneId: zone.id, enter, exit });
        }
      }
    });
    return out.sort((a, b) => a.enter - b.enter);
  }

  const boxLength = (m: Mover): number => m.spec.length + m.spec.idm.s0 + BOX_MARGIN;

  /** True if another mover's front lies between this mover's front and `distance`. */
  function blockedBefore(m: Mover, distance: number, occ: Map<string, Occupant[]>): boolean {
    let blocked = false;
    walkAhead(m, distance, (edgeId, offset, isCurrent) => {
      for (const o of occ.get(edgeId) ?? []) {
        if (o.id === m.spec.id || (isCurrent && o.s <= m.s)) continue;
        const front = offset + o.s;
        if (front > 0 && front <= distance + 1e-6) blocked = true;
      }
    });
    return blocked;
  }

  /** Box rule: room for the whole vehicle (plus margin) after the chain exit, free of movers and stop lines. */
  function downstreamClear(m: Mover, chainExit: number, occ: Map<string, Occupant[]>, stops: Map<string, number[]>): boolean {
    const routeEnd = distanceToRouteEnd(m);
    if (routeEnd < chainExit + m.spec.length) return false;
    const regionEnd = Math.min(chainExit + boxLength(m), routeEnd);
    let clear = true;
    walkAhead(m, regionEnd, (edgeId, offset) => {
      for (const o of occ.get(edgeId) ?? []) {
        if (o.id === m.spec.id) continue;
        const rear = offset + o.s - o.length;
        const front = offset + o.s;
        if (front > chainExit && rear < regionEnd) clear = false;
      }
      for (const line of stops.get(edgeId) ?? []) {
        const at = offset + line;
        if (at > chainExit && at <= regionEnd) clear = false;
      }
    });
    return clear;
  }

  /** Requests and acquires zone chains; returns the distance to the next zone the mover may not enter, or null. */
  function manageZones(m: Mover, occ: Map<string, Occupant[]>, stops: Map<string, number[]>): number | null {
    const ahead = zonesAhead(m, lookAhead + 60);
    let i = ahead.findIndex((z) => !m.held.has(z.zoneId) && z.enter >= -1e-6);
    if (i < 0) {
      m.ticket = null;
      return null;
    }
    const first = ahead[i] as ZoneAhead;
    const chain = [first.zoneId];
    let chainExit = first.exit;
    for (i++; i < ahead.length; i++) {
      const z = ahead[i] as ZoneAhead;
      if (z.enter >= chainExit + boxLength(m)) break;
      if (!m.held.has(z.zoneId) && !chain.includes(z.zoneId)) chain.push(z.zoneId);
      chainExit = Math.max(chainExit, z.exit);
    }

    const p = m.spec.idm;
    const requestRange = Math.min(lookAhead, Math.max(15, (m.v * m.v) / (2 * p.b) + m.v * p.T + 8));
    if (first.enter > requestRange) return first.enter;

    if (m.ticket === null) {
      if (blockedBefore(m, first.enter, occ)) return first.enter;
      m.ticket = tick;
    }
    for (const zoneId of chain) {
      if (m.requested.has(zoneId)) continue;
      zones.request(zoneId, { id: m.spec.id, priority: m.spec.priority, arrivedAt: m.ticket });
      m.requested.add(zoneId);
    }

    const ready = chain.every((zoneId) => zones.holder(zoneId) === null && zones.queue(zoneId)[0] === m.spec.id);
    if (!ready || !downstreamClear(m, chainExit, occ, stops)) return first.enter;

    for (const zoneId of chain) {
      zones.tryAcquire(zoneId, m.spec.id, true);
      m.requested.delete(zoneId);
      const occurrence = ahead.filter((z) => z.zoneId === zoneId);
      const exit = Math.max(...occurrence.map((z) => z.exit));
      m.held.set(zoneId, m.odo + exit);
    }
    m.ticket = null;
    // The next chain starts at least a box length beyond this one; it is handled next step.
    const next = ahead.find((z) => !m.held.has(z.zoneId) && z.enter >= chainExit);
    return next ? next.enter : null;
  }

  function releaseZones(m: Mover): void {
    for (const [zoneId, exitOdo] of m.held) {
      if (m.odo - m.spec.length >= exitOdo - 1e-9) {
        zones.release(zoneId, m.spec.id);
        m.held.delete(zoneId);
      }
    }
  }

  function dropRequests(m: Mover): void {
    for (const zoneId of m.requested) zones.cancel(zoneId, m.spec.id);
    m.requested.clear();
    m.ticket = null;
  }

  // ---------- motion ----------

  function moveAlong(m: Mover, ds: number): void {
    m.s += ds;
    m.odo += ds;
    while (m.idx < m.route.length - 1 && m.s > len(m.route[m.idx] as string)) {
      m.s -= len(m.route[m.idx] as string);
      m.idx++;
    }
    const end = len(m.route[m.idx] as string);
    if (m.idx === m.route.length - 1 && end - m.s < FINISH_TOLERANCE) {
      m.odo += end - m.s;
      m.s = end;
      m.v = 0;
      m.finished = true;
    }
  }

  function step(dt: number, speedFactor = 1): void {
    tick++;
    viewCache = null;
    const occ = occupancy();
    const stops = staticStops();
    const world: LeaderWorld = {
      edgeLength: len,
      occupants: (edgeId) => occ.get(edgeId) ?? [],
      stopLines: (edgeId) => stops.get(edgeId) ?? [],
    };

    // Phase 1: zones and leaders from start-of-step positions (all movers see the same world).
    const plans: { m: Mover; ds: number; v: number }[] = [];
    for (const m of movers.values()) {
      if (m.finished) continue;
      const zoneStop = manageZones(m, occ, stops);
      const obstacles: LeaderInfo[] = [];
      const leader = findLeader({ id: m.spec.id, route: m.route, routeIndex: m.idx, s: m.s, lookAhead }, world);
      if (leader) obstacles.push(leader);
      if (zoneStop !== null) obstacles.push({ gap: zoneStop, speed: 0 });
      const toEnd = distanceToRouteEnd(m);
      // The route end is a stop line the front reaches exactly (moveAlong clamps the overshoot).
      if (toEnd <= lookAhead) obstacles.push({ gap: toEnd + m.spec.idm.s0 + END_OVERSHOOT, speed: 0 });
      const nearest = obstacles.reduce<LeaderInfo | null>((best, o) => (best === null || o.gap < best.gap ? o : best), null);
      const edge = graph.edge(m.route[m.idx] as string);
      const params: IdmParams = { ...m.spec.idm, v0: Math.min(m.spec.idm.v0, edge.speedLimit) * speedFactor };
      const next = advance({ s: 0, v: m.v }, nearest, params, dt);
      plans.push({ m, ds: next.s, v: next.v });
    }

    // Phase 2: apply motion, then release zones whose exit the rear has passed.
    for (const { m, ds, v } of plans) {
      m.v = v;
      moveAlong(m, ds);
    }
    for (const m of movers.values()) releaseZones(m);
  }

  // ---------- public API ----------

  function spawn(spec: MoverSpec, at?: number): boolean {
    if (movers.has(spec.id) || spec.route.length === 0) return false;
    const entry = spec.route[0] as string;
    const s = at ?? spec.length;
    if (s < spec.length - 1e-9 || s > len(entry) + 1e-9) return false;
    const freeFrom = s - spec.length - spec.idm.s0;
    const freeTo = s + spec.idm.s0;
    for (const m of movers.values()) {
      for (const [edgeId, from, to] of bodySpans(m)) {
        if (edgeId === entry && from < freeTo && to > freeFrom) return false;
      }
      // Someone about to drive onto the entry edge from upstream, close to the new body.
      if (m.route[m.idx + 1] === entry && freeFrom < 0) {
        const remaining = len(m.route[m.idx] as string) - m.s;
        const p = m.spec.idm;
        if (remaining < (m.v * m.v) / (2 * p.b) + m.v * p.T + freeTo) return false;
      }
    }
    movers.set(spec.id, {
      spec,
      route: [...spec.route],
      idx: 0,
      s,
      v: 0,
      odo: s,
      finished: spec.route.length === 1 && len(entry) - s < FINISH_TOLERANCE,
      held: new Map(),
      requested: new Set(),
      ticket: null,
    });
    viewCache = null;
    return true;
  }

  function remove(id: string): void {
    const m = movers.get(id);
    if (!m) return;
    for (const zoneId of m.held.keys()) zones.release(zoneId, id);
    dropRequests(m);
    movers.delete(id);
    viewCache = null;
  }

  function setRoute(id: string, route: readonly string[]): void {
    const m = movers.get(id);
    if (!m) throw new Error(`Unknown mover ${id}`);
    if (route[0] !== m.route[m.idx]) throw new Error(`New route for ${id} must start with its current edge`);
    const past = m.route.slice(Math.max(0, m.idx - KEEP_PAST_EDGES), m.idx);
    m.route = [...past, ...route];
    m.idx = past.length;
    m.finished = m.idx === m.route.length - 1 && len(m.route[m.idx] as string) - m.s < FINISH_TOLERANCE;
    dropRequests(m);
    viewCache = null;
  }

  return {
    zones,
    get tick() {
      return tick;
    },
    spawn,
    step,
    movers() {
      viewCache ??= [...movers.values()].map(view);
      return viewCache;
    },
    mover(id) {
      const m = movers.get(id);
      return m ? view(m) : null;
    },
    remove,
    setRoute,
    setLength(id, length) {
      const m = movers.get(id);
      if (!m) throw new Error(`Unknown mover ${id}`);
      m.spec = { ...m.spec, length };
      viewCache = null;
    },
    occupies(id, edgeId) {
      const m = movers.get(id);
      return m ? bodySpans(m).some(([e, from, to]) => e === edgeId && to - from > 1e-9) : false;
    },
    pointBehind(id, distance) {
      const m = movers.get(id);
      if (!m) throw new Error(`Unknown mover ${id}`);
      return pointBehind(m, distance);
    },
    addStopLine(key, edgeId, s) {
      graph.edge(edgeId);
      stopLines.set(key, { edgeId, s });
    },
    removeStopLine(key) {
      stopLines.delete(key);
    },
  };
}
