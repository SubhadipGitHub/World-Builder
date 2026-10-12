import type { Edge } from '../sim/graph/laneGraph';
import type { Vec2 } from '../sim/types';
import { hub, hubGraph } from './hub';

// Shared clearance maths for everything placed beside the roads (architecture §18, G1):
// lamps, the M5 site plan and tree planting.

/** Shortest distance from a point to an edge's centre line. */
export function distanceToEdge(p: Vec2, e: Edge): number {
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

interface EdgeBox {
  readonly edge: Edge;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

let boxes: readonly EdgeBox[] | null = null;

/** Edges with their bounding boxes, computed once (a cheap reject before the exact distance). */
export function edgeBoxes(): readonly EdgeBox[] {
  boxes ??= hubGraph().edges.map((edge) => {
    const xs = edge.path.points.map((p) => p.x);
    const zs = edge.path.points.map((p) => p.z);
    return { edge, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  });
  return boxes;
}

/**
 * True if `p` is outside every road corridor of the hub by at least `clearance` metres
 * (corridor = edge centre line ± width / 2). Pedestrian edges count as corridors too.
 */
export function clearOfRoads(p: Vec2, clearance: number): boolean {
  for (const b of edgeBoxes()) {
    const need = b.edge.width / 2 + clearance;
    if (p.x < b.minX - need || p.x > b.maxX + need || p.z < b.minZ - need || p.z > b.maxZ + need) continue;
    if (distanceToEdge(p, b.edge) < need) return false;
  }
  return true;
}

/** True if `p` lies inside a building footprint grown by `margin` (the Ready lot surface excepted). */
export function insideBuilding(p: Vec2, margin: number): boolean {
  return hub.buildings.some((b) => b.id !== 'lot' && Math.abs(p.x - b.x) < b.width / 2 + margin && Math.abs(p.z - b.z) < b.depth / 2 + margin);
}
