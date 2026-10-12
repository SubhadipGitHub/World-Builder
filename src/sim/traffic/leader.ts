import type { LeaderInfo } from './idm';

/** An agent on an edge; s is the FRONT bumper position along that edge. */
export interface Occupant {
  readonly id: string;
  readonly s: number;
  readonly length: number;
  readonly speed: number;
}

export interface LeaderQuery {
  readonly id: string;
  readonly route: readonly string[];
  readonly routeIndex: number;
  /** Front bumper position on route[routeIndex]. */
  readonly s: number;
  readonly lookAhead: number;
}

export interface LeaderWorld {
  edgeLength(edgeId: string): number;
  occupants(edgeId: string): readonly Occupant[];
  /** Positions where a mover's front must stop (unreserved zones, unclaimed resources, closed gates). */
  stopLines(edgeId: string): readonly number[];
}

export interface Leader extends LeaderInfo {
  /** Occupant id, or null for a stop line. */
  readonly id: string | null;
}

/**
 * Nearest obstacle ahead along the mover's own route, within lookAhead.
 * Occupant gap = occupant rear (s - length) minus mover front, summed across edges.
 * Stop-line gap = line minus mover front. Ignores itself, anything behind it,
 * and edges not on its route.
 */
export function findLeader(query: LeaderQuery, world: LeaderWorld): Leader | null {
  let best: Leader | null = null;
  // Distance from the mover's front to the start of the edge being scanned.
  let offset = -query.s;
  for (let k = query.routeIndex; k < query.route.length; k++) {
    if (offset > query.lookAhead) break;
    const edgeId = query.route[k] as string;
    const current = k === query.routeIndex;
    for (const o of world.occupants(edgeId)) {
      if (o.id === query.id || (current && o.s <= query.s)) continue;
      const gap = offset + o.s - o.length;
      if (gap <= query.lookAhead && (best === null || gap < best.gap)) best = { id: o.id, gap, speed: o.speed };
    }
    for (const line of world.stopLines(edgeId)) {
      if (current && line < query.s - 1e-9) continue;
      const gap = offset + line;
      if (gap <= query.lookAhead && (best === null || gap < best.gap)) best = { id: null, gap, speed: 0 };
    }
    // No early exit once something is found: a long vehicle whose front is on a later
    // edge can have its rear closer than an obstacle on this one.
    offset += world.edgeLength(edgeId);
  }
  return best;
}
