import type { Boom } from '../../layout/site';
import type { Pose } from '../../layout/positions';
import type { Vec2 } from '../../sim/types';

// Pure animation helpers for the M5 site (architecture §18, G5, G10). No three, no DOM.

export interface MovingVehicle {
  readonly x: number;
  readonly z: number;
  /** Pedestrians never open a boom. */
  readonly kind: string;
}

/** A vehicle opens the boom when within this distance before it… */
export const BOOM_APPROACH_M = 14;
/** …and keeps it open until this far past it. */
export const BOOM_PAST_M = 4;
/** Lateral reach: vehicles further than this from the line through the pivot along the road are ignored. */
export const BOOM_LANE_M = 4;

/** True when the boom should be up (render-only, SEC-2): any non-pedestrian approaching or just past. */
export function boomTarget(vehicles: readonly MovingVehicle[], boom: Boom): boolean {
  const dx = Math.cos(boom.heading);
  const dz = Math.sin(boom.heading);
  return vehicles.some((v) => {
    if (v.kind === 'pedestrian') return false;
    const rx = v.x - boom.pivot.x;
    const rz = v.z - boom.pivot.z;
    const along = rx * dx + rz * dz;
    const lateral = Math.abs(rx * dz - rz * dx);
    return lateral <= BOOM_LANE_M && along >= -BOOM_APPROACH_M && along <= BOOM_PAST_M;
  });
}

/**
 * Flag cloth displacement (B-2) at time t for cloth coordinates u (0 at the pole … 1 at the free
 * edge) and v (0 bottom … 1 top). Zero at the pole, |d| ≤ 0.35 m · u, and 0 everywhere when rate is 0.
 */
export function flagWave(t: number, u: number, v: number, rate: number): number {
  if (rate === 0 || u === 0) return 0;
  const ripple = Math.sin(u * 5 - t * 6 * rate + v * 1.5);
  const gust = 0.6 + 0.4 * Math.sin(t * 1.3 * rate + v);
  return 0.35 * u * ripple * gust;
}

/** Patrol car speed (SEC-4). */
export const PATROL_SPEED = 8;

/** Pose along a closed loop at time t, moving at PATROL_SPEED; wraps around. */
export function patrolPose(loop: readonly Vec2[], t: number): Pose {
  const n = loop.length;
  const lengths = loop.map((a, i) => {
    const b = loop[(i + 1) % n] as Vec2;
    return Math.hypot(b.x - a.x, b.z - a.z);
  });
  const total = lengths.reduce((s, l) => s + l, 0);
  if (n < 2 || total === 0) return { x: loop[0]?.x ?? 0, z: loop[0]?.z ?? 0, heading: 0 };
  let s = (((t * PATROL_SPEED) % total) + total) % total;
  for (let i = 0; i < n; i++) {
    const l = lengths[i] as number;
    if (s <= l || i === n - 1) {
      const a = loop[i] as Vec2;
      const b = loop[(i + 1) % n] as Vec2;
      const f = l === 0 ? 0 : Math.min(1, s / l);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(b.z - a.z, b.x - a.x) };
    }
    s -= l;
  }
  return { x: loop[0]?.x ?? 0, z: loop[0]?.z ?? 0, heading: 0 };
}

/** CCTV head yaw offset (radians, ±0.6) for camera i at time t; 0 when motion is off. */
export function cctvPan(t: number, i: number, motion: boolean): number {
  return motion ? 0.6 * Math.sin(t * 0.35 + i * 1.7) : 0;
}

export interface SiteDetail {
  /** Flag wave rate: 1 full, 0.5 half, 0 still. */
  readonly flagRate: number;
  readonly cctvMotion: boolean;
  readonly patrol: boolean;
  readonly clutter: boolean;
}

/** Detail per quality tier (D21, §10.4); reduced motion stills flags and cameras on every tier. */
export function siteDetail(tier: number, reducedMotion: boolean): SiteDetail {
  const base: SiteDetail =
    tier <= 0
      ? { flagRate: 1, cctvMotion: true, patrol: true, clutter: true }
      : tier === 1
        ? { flagRate: 0.5, cctvMotion: false, patrol: true, clutter: true }
        : { flagRate: 0, cctvMotion: false, patrol: false, clutter: false };
  return reducedMotion ? { ...base, flagRate: 0, cctvMotion: false } : base;
}
