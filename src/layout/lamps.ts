import type { Edge } from '../sim/graph/laneGraph';
import type { Vec2 } from '../sim/types';
import { hub, hubGraph } from './hub';

export interface LampPlacement {
  readonly x: number;
  readonly z: number;
  /** Radians: the direction the lamp head reaches out over the road. */
  readonly heading: number;
  readonly kind: 'street' | 'walkway' | 'flood';
}

/** Spacing between lamps along a road side, metres (V-6). */
export const LAMP_SPACING = 25;

const MIN_GAP = 12;
const CLEARANCE = 0.6;
const KERB = 1.6;
const MAIN_ROAD_SPEED = 9;
/** Ready-lot floodlights on the medians between rows (unchanged from M1). */
const FLOODS: readonly Vec2[] = [-4, 20.5, 42.5, 68].flatMap((x) => [100, 120, 140, 160].map((z) => ({ x, z })));

function distanceToEdge(p: Vec2, e: Edge): number {
  let best = Infinity;
  const pts = e.path.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Vec2;
    const b = pts[i] as Vec2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
  }
  return best;
}

interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

let cached: readonly LampPlacement[] | null = null;

/**
 * Roadside lamp positions generated from the lane graph (architecture §16, P4), deterministic:
 *  - 'street' lamps about every 25 m along each vehicle road, set just outside the road corridor;
 *    main roads (speed limit ≥ 9 m/s) get lamps on both sides
 *  - 'walkway' lamps along pedestrian edges
 *  - 'flood' lamps on the medians of the Ready lot
 * Never inside any road corridor or building footprint (the lot surface excepted), never closer
 * than 12 m to another lamp.
 */
export function lampPlacements(): readonly LampPlacement[] {
  if (cached) return cached;
  const graph = hubGraph();
  const edges = graph.edges;
  const bounds = new Map<string, Box>(
    edges.map((e) => {
      const xs = e.path.points.map((p) => p.x);
      const zs = e.path.points.map((p) => p.z);
      return [e.id, { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }];
    }),
  );
  const buildings = hub.buildings.filter((b) => b.id !== 'lot');
  const lamps: LampPlacement[] = [];

  const isWalk = (e: Edge): boolean => e.kinds?.includes('pedestrian') ?? false;
  const nearestEdge = (p: Vec2, walk: boolean): { edge: Edge; d: number } => {
    let best: { edge: Edge; d: number } = { edge: edges[0] as Edge, d: Infinity };
    for (const e of edges) {
      if (isWalk(e) !== walk) continue;
      const b = bounds.get(e.id) as Box;
      if (p.x < b.minX - best.d || p.x > b.maxX + best.d || p.z < b.minZ - best.d || p.z > b.maxZ + best.d) continue;
      const d = distanceToEdge(p, e);
      if (d < best.d) best = { edge: e, d };
    }
    return best;
  };

  const clear = (p: Vec2): boolean => {
    for (const e of edges) {
      const b = bounds.get(e.id) as Box;
      const need = e.width / 2 + CLEARANCE;
      if (p.x < b.minX - need || p.x > b.maxX + need || p.z < b.minZ - need || p.z > b.maxZ + need) continue;
      if (distanceToEdge(p, e) < need) return false;
    }
    for (const b of buildings) if (Math.abs(p.x - b.x) < b.width / 2 && Math.abs(p.z - b.z) < b.depth / 2) return false;
    return lamps.every((l) => Math.hypot(l.x - p.x, l.z - p.z) >= MIN_GAP);
  };

  /** Street and flood lamps reach over the nearest vehicle road; walkway lamps over the walkway. */
  const aimAtRoad = (p: Vec2, walk = false): number => {
    const { edge } = nearestEdge(p, walk);
    let s = 0;
    let bestD = Infinity;
    for (let t = 0; t <= edge.length; t += 0.25) {
      const q = edge.path.pointAt(t);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bestD) {
        bestD = d;
        s = t;
      }
    }
    const q = edge.path.pointAt(s);
    return Math.atan2(q.z - p.z, q.x - p.x);
  };

  for (const f of FLOODS) if (clear(f)) lamps.push({ x: f.x, z: f.z, heading: aimAtRoad(f), kind: 'flood' });

  /** Tries a few distances out from the road; returns the first clear spot. */
  const tryPlace = (e: Edge, s: number, side: 1 | -1, kind: 'street' | 'walkway'): boolean => {
    const p = e.path.pointAt(s);
    const h = e.path.headingAt(s);
    const nx = -Math.sin(h) * side;
    const nz = Math.cos(h) * side;
    for (const extra of [0, 1.5, 3]) {
      const off = e.width / 2 + KERB + extra;
      const q = { x: p.x + nx * off, z: p.z + nz * off };
      if (clear(q)) {
        lamps.push({ x: q.x, z: q.z, heading: aimAtRoad(q, kind === 'walkway'), kind });
        return true;
      }
    }
    return false;
  };

  // Main roads first, longest first, so they get the best spots; ties broken by id (deterministic).
  const vehicle = edges
    .filter((e) => !isWalk(e))
    .sort((a, b) => Number(b.speedLimit >= MAIN_ROAD_SPEED) - Number(a.speedLimit >= MAIN_ROAD_SPEED) || b.length - a.length || (a.id < b.id ? -1 : 1));
  for (const e of vehicle) {
    if (e.length < MIN_GAP) continue;
    const both = e.speedLimit >= MAIN_ROAD_SPEED;
    for (let s = LAMP_SPACING / 2; s < e.length; s += LAMP_SPACING) {
      if (both) {
        tryPlace(e, s, 1, 'street');
        tryPlace(e, Math.min(e.length, s + LAMP_SPACING / 2), -1, 'street');
      } else if (!tryPlace(e, s, 1, 'street')) {
        tryPlace(e, s, -1, 'street');
      }
    }
  }

  for (const e of edges.filter(isWalk)) {
    for (let s = 8; s < e.length; s += 20) if (!tryPlace(e, s, 1, 'walkway')) tryPlace(e, s, -1, 'walkway');
  }

  cached = lamps;
  return lamps;
}
