import type { AgentKind, Vec2 } from '../types';
import { createPath, type Path } from './path';

export interface NodeSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export interface EdgeSpec {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Intermediate points between the from and to nodes. */
  readonly via?: readonly Vec2[];
  /** m/s */
  readonly speedLimit: number;
  /** Agent kinds allowed on the edge; omitted = all. */
  readonly kinds?: readonly AgentKind[];
  /** Corridor width in metres (default 3.5). Used for conflict detection. */
  readonly width?: number;
  /**
   * Edges sharing a group never conflict with each other: they are only ever used by
   * one agent at a time because a single resource reservation covers them all.
   */
  readonly group?: string;
}

export interface LaneGraphSpec {
  readonly nodes: readonly NodeSpec[];
  readonly edges: readonly EdgeSpec[];
}

export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly path: Path;
  readonly length: number;
  readonly speedLimit: number;
  readonly kinds: readonly AgentKind[] | null;
  readonly width: number;
  readonly group: string | null;
}

export interface ZoneInterval {
  readonly edgeId: string;
  readonly sEnter: number;
  readonly sExit: number;
}

/**
 * Region where the corridors of two or more edges overlap (architecture §4.3).
 * Two edges conflict where centreline distance < (widthA + widthB) / 2.
 * Edges joined in series (a.to === b.from), joined by a forward hop shorter than their clearance
 * (same lane, already ordered by car-following), or sharing a group, do not conflict with each other.
 * Conflicts whose intervals overlap on a shared edge are merged into one zone.
 */
export interface ConflictZone {
  readonly id: string;
  readonly intervals: readonly ZoneInterval[];
}

export interface LaneGraph {
  readonly edges: readonly Edge[];
  readonly zones: readonly ConflictZone[];
  /** Throws on an unknown id. */
  edge(id: string): Edge;
  outgoing(nodeId: string): readonly Edge[];
  /**
   * Shortest route by length, inclusive of both edges; null if unreachable.
   * With a kind, edges that exclude that kind are skipped; without one, kind limits are ignored.
   */
  route(fromEdgeId: string, toEdgeId: string, kind?: AgentKind): readonly string[] | null;
  /** Zones touching an edge, ordered by sEnter. */
  zonesOn(edgeId: string): readonly { readonly zone: ConflictZone; readonly interval: ZoneInterval }[];
}

const DEFAULT_WIDTH = 3.5;
const SAMPLE_STEP = 0.25;

function distanceToPath(p: Vec2, path: Path): number {
  let best = Infinity;
  const pts = path.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Vec2;
    const b = pts[i] as Vec2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
  }
  return best;
}

/** [min, max] arc-length range on `a` lying within `limit` of `b`, or null. */
function conflictRange(a: Edge, b: Edge, limit: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const n = Math.max(1, Math.ceil(a.length / SAMPLE_STEP));
  for (let i = 0; i <= n; i++) {
    const s = (a.length * i) / n;
    if (distanceToPath(a.path.pointAt(s), b.path) < limit - 1e-9) {
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
  }
  if (lo > hi) return null;
  // Pad by one sample so the true boundary is always inside the interval.
  const pad = a.length / n;
  return [Math.max(0, lo - pad), Math.min(a.length, hi + pad)];
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const boundsOf = (e: Edge): Bounds => {
  const xs = e.path.points.map((p) => p.x);
  const zs = e.path.points.map((p) => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};

/** Nodes reachable from `start` by driving forward less than `maxDist` metres, with their distance. */
function nearbyDownstream(start: string, maxDist: number, outgoing: ReadonlyMap<string, readonly Edge[]>): Map<string, number> {
  const best = new Map<string, number>([[start, 0]]);
  const frontier: [string, number][] = [[start, 0]];
  while (frontier.length > 0) {
    const [nodeId, d] = frontier.pop() as [string, number];
    for (const e of outgoing.get(nodeId) ?? []) {
      const nd = d + e.length;
      if (nd >= maxDist) continue;
      const old = best.get(e.to);
      if (old === undefined || nd < old) {
        best.set(e.to, nd);
        frontier.push([e.to, nd]);
      }
    }
  }
  return best;
}

function computeZones(edges: readonly Edge[]): ConflictZone[] {
  const bounds = edges.map(boundsOf);
  const outgoing = new Map<string, Edge[]>();
  for (const e of edges) outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e]);
  const maxWidth = Math.max(...edges.map((e) => e.width));
  const downstream = new Map<string, Map<string, number>>();
  const reach = (nodeId: string): Map<string, number> => {
    let m = downstream.get(nodeId);
    if (!m) {
      m = nearbyDownstream(nodeId, maxWidth, outgoing);
      downstream.set(nodeId, m);
    }
    return m;
  };
  /** b starts a short forward hop after a ends: same lane, so traffic is already ordered. */
  const sameLane = (a: Edge, b: Edge, limit: number): boolean => (reach(a.to).get(b.from) ?? Infinity) < limit;
  // One entry per conflicting pair: two intervals.
  const conflicts: [ZoneInterval, ZoneInterval][] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i] as Edge;
      const b = edges[j] as Edge;
      if (a.to === b.from || b.to === a.from) continue;
      if (a.group !== null && a.group === b.group) continue;
      const limit = (a.width + b.width) / 2;
      if (sameLane(a, b, limit) || sameLane(b, a, limit)) continue;
      const ba = bounds[i] as Bounds;
      const bb = bounds[j] as Bounds;
      if (ba.minX - limit > bb.maxX || bb.minX - limit > ba.maxX || ba.minZ - limit > bb.maxZ || bb.minZ - limit > ba.maxZ) continue;
      const ra = conflictRange(a, b, limit);
      if (!ra) continue;
      const rb = conflictRange(b, a, limit);
      if (!rb) continue;
      conflicts.push([
        { edgeId: a.id, sEnter: ra[0], sExit: ra[1] },
        { edgeId: b.id, sEnter: rb[0], sExit: rb[1] },
      ]);
    }
  }

  // Union-find: merge conflicts whose intervals overlap on a shared edge.
  const parent = conflicts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i] as number] as number;
      i = parent[i] as number;
    }
    return i;
  };
  const overlaps = (p: ZoneInterval, q: ZoneInterval): boolean => p.edgeId === q.edgeId && p.sEnter <= q.sExit && q.sEnter <= p.sExit;
  for (let i = 0; i < conflicts.length; i++) {
    for (let j = i + 1; j < conflicts.length; j++) {
      const ci = conflicts[i] as [ZoneInterval, ZoneInterval];
      const cj = conflicts[j] as [ZoneInterval, ZoneInterval];
      if (ci.some((p) => cj.some((q) => overlaps(p, q)))) parent[find(i)] = find(j);
    }
  }

  const groups = new Map<number, Map<string, ZoneInterval>>();
  conflicts.forEach((c, i) => {
    const root = find(i);
    const byEdge = groups.get(root) ?? new Map<string, ZoneInterval>();
    for (const iv of c) {
      const prev = byEdge.get(iv.edgeId);
      byEdge.set(
        iv.edgeId,
        prev ? { edgeId: iv.edgeId, sEnter: Math.min(prev.sEnter, iv.sEnter), sExit: Math.max(prev.sExit, iv.sExit) } : iv,
      );
    }
    groups.set(root, byEdge);
  });

  const zones = [...groups.values()].map((byEdge) =>
    [...byEdge.values()].sort((p, q) => (p.edgeId < q.edgeId ? -1 : p.edgeId > q.edgeId ? 1 : p.sEnter - q.sEnter)),
  );
  zones.sort((p, q) => {
    const a = p[0] as ZoneInterval;
    const b = q[0] as ZoneInterval;
    return a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : a.sEnter - b.sEnter;
  });
  return zones.map((intervals, i) => ({ id: `z${String(i)}`, intervals }));
}

/** Throws on duplicate ids or references to unknown nodes. */
export function buildLaneGraph(spec: LaneGraphSpec): LaneGraph {
  const nodes = new Map<string, NodeSpec>();
  for (const n of spec.nodes) {
    if (nodes.has(n.id)) throw new Error(`Duplicate node id ${n.id}`);
    nodes.set(n.id, n);
  }

  const edgeMap = new Map<string, Edge>();
  const outgoingMap = new Map<string, Edge[]>();
  for (const e of spec.edges) {
    if (edgeMap.has(e.id)) throw new Error(`Duplicate edge id ${e.id}`);
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) throw new Error(`Edge ${e.id} references an unknown node`);
    const path = createPath([{ x: from.x, z: from.z }, ...(e.via ?? []), { x: to.x, z: to.z }]);
    const edge: Edge = {
      id: e.id,
      from: e.from,
      to: e.to,
      path,
      length: path.length,
      speedLimit: e.speedLimit,
      kinds: e.kinds ? [...e.kinds] : null,
      width: e.width ?? DEFAULT_WIDTH,
      group: e.group ?? null,
    };
    edgeMap.set(e.id, edge);
    const out = outgoingMap.get(e.from) ?? [];
    out.push(edge);
    outgoingMap.set(e.from, out);
  }
  const edges = [...edgeMap.values()];

  const getEdge = (id: string): Edge => {
    const e = edgeMap.get(id);
    if (!e) throw new Error(`Unknown edge ${id}`);
    return e;
  };

  const zones = computeZones(edges);
  const zonesByEdge = new Map<string, { zone: ConflictZone; interval: ZoneInterval }[]>();
  for (const zone of zones) {
    for (const interval of zone.intervals) {
      const list = zonesByEdge.get(interval.edgeId) ?? [];
      list.push({ zone, interval });
      zonesByEdge.set(interval.edgeId, list);
    }
  }
  for (const list of zonesByEdge.values()) list.sort((p, q) => p.interval.sEnter - q.interval.sEnter);

  const routeCache = new Map<string, readonly string[] | null>();
  const allows = (e: Edge, kind: AgentKind | undefined): boolean => kind === undefined || e.kinds === null || e.kinds.includes(kind);

  const route = (fromEdgeId: string, toEdgeId: string, kind?: AgentKind): readonly string[] | null => {
    const key = `${fromEdgeId}|${toEdgeId}|${kind ?? '*'}`;
    const cached = routeCache.get(key);
    if (cached !== undefined) return cached;
    getEdge(fromEdgeId);
    getEdge(toEdgeId);
    // Dijkstra over edges; cost of an edge = its own length. Ties break by edge id.
    const dist = new Map<string, number>([[fromEdgeId, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    let result: readonly string[] | null = null;
    for (;;) {
      let current: string | null = null;
      let best = Infinity;
      for (const [id, d] of dist) {
        if (done.has(id)) continue;
        if (d < best || (d === best && current !== null && id < current)) {
          best = d;
          current = id;
        }
      }
      if (current === null) break;
      if (current === toEdgeId) {
        const out = [current];
        let p = prev.get(current);
        while (p !== undefined) {
          out.unshift(p);
          p = prev.get(p);
        }
        result = out;
        break;
      }
      done.add(current);
      for (const next of outgoingMap.get(getEdge(current).to) ?? []) {
        if (!allows(next, kind) || done.has(next.id)) continue;
        const nd = best + next.length;
        const old = dist.get(next.id);
        if (old === undefined || nd < old) {
          dist.set(next.id, nd);
          prev.set(next.id, current);
        }
      }
    }
    routeCache.set(key, result);
    return result;
  };

  return {
    edges,
    zones,
    edge: getEdge,
    outgoing: (nodeId) => outgoingMap.get(nodeId) ?? [],
    route,
    zonesOn: (edgeId) => zonesByEdge.get(edgeId) ?? [],
  };
}
