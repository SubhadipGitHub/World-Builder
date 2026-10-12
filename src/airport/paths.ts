import type { Vec2 } from '../sim/types';

// Path maths for the airport (architecture §19, H1, H3). Pure.

export interface Keyframe {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Sample3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Direction of travel in the ground plane (radians, atan2(dz, dx)). */
  readonly heading: number;
  /** Climb angle (radians, + nose up). */
  readonly pitch: number;
  /** Ground speed (m/s). */
  readonly speed: number;
}

/**
 * Linear interpolation between keyframes sorted by t, clamped to the first and last frame.
 * Heading, pitch and speed come from the segment being travelled; while holding still they keep the
 * last segment's heading, with speed 0. Throws on an empty list.
 */
export function sampleKeyframes(keys: readonly Keyframe[], t: number): Sample3 {
  if (keys.length === 0) throw new Error('sampleKeyframes needs at least one keyframe');
  // Segment index: the last frame at or before t (clamped).
  let i = 0;
  while (i < keys.length - 2 && (keys[i + 1] as Keyframe).t <= t) i++;
  const a = keys[i] as Keyframe;
  const b = keys[i + 1] ?? a;
  const span = b.t - a.t;
  const f = span <= 0 ? 1 : Math.min(1, Math.max(0, (t - a.t) / span));
  const x = a.x + (b.x - a.x) * f;
  const y = a.y + (b.y - a.y) * f;
  const z = a.z + (b.z - a.z) * f;
  // Heading and pitch from the segment travelled; while holding still, from the last moving segment.
  let j = i;
  let dx = b.x - a.x;
  let dz = b.z - a.z;
  let dy = b.y - a.y;
  while (Math.hypot(dx, dz, dy) < 1e-9 && j > 0) {
    j--;
    const p = keys[j] as Keyframe;
    const q = keys[j + 1] as Keyframe;
    dx = q.x - p.x;
    dz = q.z - p.z;
    dy = q.y - p.y;
  }
  const flat = Math.hypot(dx, dz);
  // Moving only inside the segment's time span; clamped before the start or after the end, speed is 0.
  const moving = span > 0 && t >= a.t && t < b.t;
  return {
    x,
    y,
    z,
    heading: Math.atan2(dz, dx),
    pitch: Math.atan2(dy, flat),
    speed: moving ? Math.hypot(b.x - a.x, b.z - a.z) / span : 0,
  };
}

/** Length of a polyline; with `closed`, including the segment back to the start. */
export function polylineLength(points: readonly Vec2[], closed = false): number {
  let total = 0;
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i] as Vec2;
    const b = points[(i + 1) % n] as Vec2;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Point and heading at distance s along a polyline (clamped when open; wrapped when closed). */
export function pointAtDistance(points: readonly Vec2[], s: number, closed = false): { readonly x: number; readonly z: number; readonly heading: number } {
  const n = points.length;
  const total = polylineLength(points, closed);
  let d = closed ? ((s % total) + total) % total : Math.min(Math.max(0, s), total);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i] as Vec2;
    const b = points[(i + 1) % n] as Vec2;
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= l || i === segs - 1) {
      const f = l === 0 ? 0 : Math.min(1, d / l);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(b.z - a.z, b.x - a.x) };
    }
    d -= l;
  }
  const p = points[0] ?? { x: 0, z: 0 };
  return { x: p.x, z: p.z, heading: 0 };
}
