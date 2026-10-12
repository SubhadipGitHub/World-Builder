import type { Edge } from '../sim/graph/laneGraph';
import type { Vec2 } from '../sim/types';
import { distanceToEdge } from './geometry';
import { hub, hubGraph } from './hub';

export interface LampPlacement {
  readonly x: number;
  readonly z: number;
  /** Radians: the direction the lamp head reaches out over the road. */
  readonly heading: number;
  /** 'mast': tall Ready-lot light masts (M5, SEC-3, G7). */
  readonly kind: 'street' | 'walkway' | 'flood' | 'mast';
}

/** Spacing between lamps along a road side, metres (V-6; 25 m before the visual review). */
export const LAMP_SPACING = 35;

const MIN_GAP = 12;
const CLEARANCE = 0.6;
const KERB = 1.6;
const MAIN_ROAD_SPEED = 9;
/** Along main roads lamps alternate sides at this step (each side every 1.2 × LAMP_SPACING). */
const MAIN_ROAD_STEP = LAMP_SPACING * 0.6;
/** Ready-lot floodlights on the medians between rows: two per median (16 before the visual review). */
const FLOODS: readonly Vec2[] = [-4, 20.5, 42.5, 68].flatMap((x) => [110, 150].map((z) => ({ x, z })));
/** Ready-lot light masts (SEC-3, G7): 4, tried at the lot's corners, then along its sides, just outside the surface. */
const MASTS = 4;
const MAST_OUTSIDE = 4;

interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

let cached: readonly LampPlacement[] | null = null;

/**
 * Roadside lamp positions generated from the lane graph (architecture §16, P4), deterministic:
 *  - 'street' lamps about every 35 m along each vehicle road, set just outside the road corridor;
 *    main roads (speed limit ≥ 9 m/s) get lamps on both sides, alternating
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

  // Masts face the lot centre; candidates go round the lot so the four end up spread out.
  const lot = hub.buildings.find((b) => b.id === 'lot');
  if (lot) {
    const hx = lot.width / 2 + MAST_OUTSIDE;
    const hz = lot.depth / 2 + MAST_OUTSIDE;
    const ring: Vec2[] = [];
    for (const [fx, fz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]] as const) ring.push({ x: lot.x + fx * hx, z: lot.z + fz * hz });
    for (let k = 1; k < 8; k++) {
      const f = k / 8;
      ring.push({ x: lot.x - hx + 2 * hx * f, z: lot.z - hz }, { x: lot.x - hx + 2 * hx * f, z: lot.z + hz }, { x: lot.x - hx, z: lot.z - hz + 2 * hz * f }, { x: lot.x + hx, z: lot.z - hz + 2 * hz * f });
    }
    let placed = 0;
    for (const p of ring) {
      if (placed === MASTS) break;
      if (!clear(p)) continue;
      lamps.push({ x: p.x, z: p.z, heading: Math.atan2(lot.z - p.z, lot.x - p.x), kind: 'mast' });
      placed++;
    }
  }

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
    if (e.speedLimit >= MAIN_ROAD_SPEED) {
      // Main roads: a zig-zag, alternating sides, so each side has a lamp every 1.2 × spacing.
      let side: 1 | -1 = 1;
      for (let s = LAMP_SPACING / 2; s < e.length; s += MAIN_ROAD_STEP) {
        tryPlace(e, s, side, 'street');
        side = side === 1 ? -1 : 1;
      }
    } else {
      for (let s = LAMP_SPACING / 2; s < e.length; s += LAMP_SPACING) if (!tryPlace(e, s, 1, 'street')) tryPlace(e, s, -1, 'street');
    }
  }

  for (const e of edges.filter(isWalk)) {
    for (let s = 8; s < e.length; s += 20) if (!tryPlace(e, s, 1, 'walkway')) tryPlace(e, s, -1, 'walkway');
  }

  cached = lamps;
  return lamps;
}
