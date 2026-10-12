import { notImplemented } from '../shared/notImplemented';
import type { Edge } from '../sim/graph/laneGraph';
import type { Vec2 } from '../sim/types';

// Shared clearance maths for everything placed beside the roads (architecture §18, G1):
// lamps, the M5 site plan and tree planting.

/** Shortest distance from a point to an edge's centre line. */
export function distanceToEdge(p: Vec2, e: Edge): number {
  return notImplemented(p, e);
}

/**
 * True if `p` is outside every road corridor of the hub by at least `clearance` metres
 * (corridor = edge centre line ± width / 2). Pedestrian edges count as corridors too.
 */
export function clearOfRoads(p: Vec2, clearance: number): boolean {
  return notImplemented(p, clearance);
}

/** True if `p` lies inside a building footprint grown by `margin` (the Ready lot surface excepted). */
export function insideBuilding(p: Vec2, margin: number): boolean {
  return notImplemented(p, margin);
}
