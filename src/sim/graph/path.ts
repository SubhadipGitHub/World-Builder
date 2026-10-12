import type { Vec2 } from '../types';

/** Polyline with arc-length parameterisation. Heading = atan2(dz, dx). */
export interface Path {
  readonly points: readonly Vec2[];
  readonly length: number;
  /** Point at arc length s, clamped to [0, length]. */
  pointAt(s: number): Vec2;
  /** Heading (radians) of the segment containing s, clamped. */
  headingAt(s: number): number;
}

/** Throws if fewer than 2 points or zero total length. */
export function createPath(points: readonly Vec2[]): Path {
  if (points.length < 2) throw new Error('A path needs at least two points');
  const pts = points.map((p) => ({ x: p.x, z: p.z }));
  // cumulative[i] = arc length at pts[i]
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Vec2;
    const b = pts[i] as Vec2;
    cumulative.push((cumulative[i - 1] as number) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cumulative[cumulative.length - 1] as number;
  if (!(length > 0)) throw new Error('A path must have non-zero length');

  /** Index i of the segment [pts[i], pts[i+1]] containing s (skips zero-length segments). */
  const segmentAt = (s: number): number => {
    let lo = 0;
    let hi = pts.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((cumulative[mid] as number) <= s) lo = mid;
      else hi = mid - 1;
    }
    while (lo > 0 && (cumulative[lo + 1] as number) - (cumulative[lo] as number) === 0) lo--;
    return lo;
  };

  const clamp = (s: number): number => Math.min(length, Math.max(0, s));

  return {
    points: pts,
    length,
    pointAt(s) {
      const c = clamp(s);
      const i = segmentAt(c);
      const a = pts[i] as Vec2;
      const b = pts[i + 1] as Vec2;
      const segLen = (cumulative[i + 1] as number) - (cumulative[i] as number);
      const t = segLen === 0 ? 0 : (c - (cumulative[i] as number)) / segLen;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    },
    headingAt(s) {
      const i = segmentAt(clamp(s));
      const a = pts[i] as Vec2;
      const b = pts[i + 1] as Vec2;
      return Math.atan2(b.z - a.z, b.x - a.x);
    },
  };
}
