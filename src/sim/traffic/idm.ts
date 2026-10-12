/** Intelligent Driver Model parameters (SI units). */
export interface IdmParams {
  /** Desired speed, m/s. */
  readonly v0: number;
  /** Maximum acceleration, m/s^2. */
  readonly a: number;
  /** Comfortable deceleration, m/s^2. */
  readonly b: number;
  /** Time headway, s. */
  readonly T: number;
  /** Minimum bumper-to-bumper gap, m. */
  readonly s0: number;
  readonly delta: number;
}

export interface LeaderInfo {
  /** Bumper-to-bumper distance to the obstacle ahead, m. */
  readonly gap: number;
  /** Obstacle speed, m/s (0 for stop lines). */
  readonly speed: number;
}

export interface MotionState {
  readonly s: number;
  readonly v: number;
}

/** IDM acceleration. gap = Infinity on a free road; dv = v - vLeader. */
export function idmAcceleration(v: number, gap: number, dv: number, p: IdmParams): number {
  const free = p.v0 > 0 ? 1 - (v / p.v0) ** p.delta : -1;
  if (!Number.isFinite(gap)) return p.a * free;
  if (gap <= 0) return -Infinity;
  const sStar = p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)));
  return p.a * (free - (sStar / gap) ** 2);
}

/**
 * One integration step. Guarantees v >= 0 and v <= v0, and never advances so far
 * that the gap to the leader falls below s0 (hard clamp, architecture §4.2).
 * If the gap is already below s0 the mover does not move.
 */
export function advance(state: MotionState, leader: LeaderInfo | null, p: IdmParams, dt: number): MotionState {
  const gap = leader ? leader.gap : Infinity;
  if (gap < p.s0) return { s: state.s, v: 0 };
  const dv = leader ? state.v - leader.speed : 0;
  const acc = idmAcceleration(state.v, gap, dv, p);
  let v = Math.min(Math.max(0, p.v0), Math.max(0, state.v + acc * dt));
  let ds = ((state.v + v) / 2) * dt;
  const maxDs = gap - p.s0;
  if (ds > maxDs) {
    // Emergency clamp: stop exactly at the minimum gap.
    ds = Math.max(0, maxDs);
    v = 0;
  }
  return { s: state.s + Math.max(0, ds), v };
}
