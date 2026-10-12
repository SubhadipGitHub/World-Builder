import type { AgentView } from '../sim/world';

export interface PoseSample {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/** Interpolates between two angles the shortest way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

/** Moves further than this between two snapshots are treated as teleports and snapped. */
export const SNAP_DISTANCE_M = 20;

/**
 * Render poses between the previous and current snapshot (architecture §5).
 * Agents in both are interpolated; agents only in `curr` use their current pose;
 * agents only in `prev` (left the map) are omitted.
 */
export function interpolateAgents(prev: readonly AgentView[], curr: readonly AgentView[], alpha: number): Map<string, PoseSample> {
  const before = new Map(prev.map((a) => [a.id, a]));
  const out = new Map<string, PoseSample>();
  for (const c of curr) {
    const p = before.get(c.id);
    if (!p || Math.hypot(c.x - p.x, c.z - p.z) > SNAP_DISTANCE_M) {
      out.set(c.id, { x: c.x, z: c.z, heading: c.heading });
      continue;
    }
    out.set(c.id, { x: p.x + (c.x - p.x) * alpha, z: p.z + (c.z - p.z) * alpha, heading: lerpAngle(p.heading, c.heading, alpha) });
  }
  return out;
}
