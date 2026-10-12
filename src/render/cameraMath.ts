import type { Bounds2D } from '../layout/positions';
import type { Vec2 } from '../sim/types';

/** Orbit camera state around a ground target (architecture A5). */
export interface CameraState {
  readonly target: Vec2;
  /** Metres from the target. */
  readonly distance: number;
  /** Radians around the vertical axis. */
  readonly azimuth: number;
  /** Radians from vertical (0 = straight down). */
  readonly polar: number;
}

export interface CameraLimits extends Bounds2D {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly minPolar: number;
  readonly maxPolar: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Shortest signed difference from a to b, in (-π, π]. */
const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Keeps the target inside the bounds and distance/polar inside their ranges (I-1). */
export function clampState(state: CameraState, limits: CameraLimits): CameraState {
  return {
    target: { x: clamp(state.target.x, limits.minX, limits.maxX), z: clamp(state.target.z, limits.minZ, limits.maxZ) },
    distance: clamp(state.distance, limits.minDistance, limits.maxDistance),
    azimuth: state.azimuth,
    polar: clamp(state.polar, limits.minPolar, limits.maxPolar),
  };
}

/** Ease-in-out cubic on [0, 1]; clamps outside that range. */
export function easeInOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export interface Glide {
  readonly from: CameraState;
  readonly to: CameraState;
  readonly duration: number;
  readonly elapsed: number;
}

export function startGlide(from: CameraState, to: CameraState, durationSec: number): Glide {
  return { from, to, duration: Math.max(0, durationSec), elapsed: 0 };
}

/**
 * Advances a glide (I-2, I-5). Azimuth takes the shortest way round.
 * Returns glide = null once finished, with state exactly equal to `to`.
 * A zero-duration glide finishes on the first step.
 */
export function stepGlide(glide: Glide, dt: number): { readonly state: CameraState; readonly glide: Glide | null } {
  const elapsed = glide.elapsed + Math.max(0, dt);
  if (glide.duration <= 0 || elapsed >= glide.duration) return { state: glide.to, glide: null };
  const k = easeInOutCubic(elapsed / glide.duration);
  const { from, to } = glide;
  return {
    state: {
      target: { x: from.target.x + (to.target.x - from.target.x) * k, z: from.target.z + (to.target.z - from.target.z) * k },
      distance: from.distance + (to.distance - from.distance) * k,
      azimuth: from.azimuth + angleDelta(from.azimuth, to.azimuth) * k,
      polar: from.polar + (to.polar - from.polar) * k,
    },
    glide: { ...glide, elapsed },
  };
}

/**
 * Follow mode: moves the target towards a moving point with exponential smoothing
 * (stiffness per second). Never overshoots; distance, azimuth and polar are unchanged.
 */
export function followTarget(state: CameraState, point: Vec2, dt: number, stiffness: number): CameraState {
  const f = 1 - Math.exp(-Math.max(0, stiffness) * Math.max(0, dt));
  return {
    ...state,
    target: { x: state.target.x + (point.x - state.target.x) * f, z: state.target.z + (point.z - state.target.z) * f },
  };
}

/**
 * Glide length in seconds: grows with how far the target moves, clamped to [0.6, 2.0].
 * 0 when the user prefers reduced motion (N-5).
 */
export function glideDuration(from: CameraState, to: CameraState, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const travel = Math.hypot(to.target.x - from.target.x, to.target.z - from.target.z) + Math.abs(to.distance - from.distance) * 0.5;
  return clamp(0.4 + travel / 250, 0.6, 2.0);
}
