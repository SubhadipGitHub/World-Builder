import type { Boom } from '../../layout/site';
import type { Pose } from '../../layout/positions';
import { notImplemented } from '../../shared/notImplemented';
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
/** Lateral reach: vehicles further than this from the boom's road line are ignored. */
export const BOOM_LANE_M = 4;

/** True when the boom should be up (render-only, SEC-2): any non-pedestrian approaching or just past. */
export function boomTarget(vehicles: readonly MovingVehicle[], boom: Boom): boolean {
  return notImplemented(vehicles, boom);
}

/**
 * Flag cloth displacement (B-2) at time t for cloth coordinates u (0 at the pole … 1 at the free
 * edge) and v (0 bottom … 1 top). Zero at the pole, |d| ≤ 0.35 m · u, and 0 everywhere when rate is 0.
 */
export function flagWave(t: number, u: number, v: number, rate: number): number {
  return notImplemented(t, u, v, rate);
}

/** Patrol car speed (SEC-4). */
export const PATROL_SPEED = 8;

/** Pose along a closed loop at time t, moving at PATROL_SPEED; wraps around. */
export function patrolPose(loop: readonly Vec2[], t: number): Pose {
  return notImplemented(loop, t);
}

/** CCTV head yaw offset (radians, ±0.6) for camera i at time t; 0 when motion is off. */
export function cctvPan(t: number, i: number, motion: boolean): number {
  return notImplemented(t, i, motion);
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
  return notImplemented(tier, reducedMotion);
}
