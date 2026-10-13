import { notImplemented } from '../shared/notImplemented';

// Lightning (M9, FE-12, architecture F11, F12). Pure and deterministic per seed; photosensitivity limits live here.

/** Minimum gap between strikes (FE-12). */
export const MIN_STRIKE_GAP_SEC = 8;
/** Maximum gap between strikes (FE-12). */
export const MAX_STRIKE_GAP_SEC = 25;
/** Flicker ceiling (WCAG 2.3.1): pulses are never closer than 1 / 3 s. */
export const MAX_FLICKER_HZ = 3;
/** Cap on the light added to the scene by a flash. */
export const MAX_FLASH_LIGHT = 0.6;
/** Cap on the light added with reduced motion (one soft pulse). */
export const REDUCED_FLASH_LIGHT = 0.25;

export interface Strike {
  /** Strike time in schedule seconds. */
  readonly t: number;
  /** Per-strike seed for the bolt shape. */
  readonly seed: number;
  readonly distanceM: number;
  /** Thunder delay, 1–4 s. */
  readonly thunderDelaySec: number;
  readonly azimuthRad: number;
}

export interface LightningSchedule {
  /** Strikes with t0 < t ≤ t1, in order. */
  strikesBetween(t0: number, t1: number): readonly Strike[];
  /** The latest strike at or before t, if any. */
  last(t: number): Strike | null;
}

export function createLightningSchedule(seed: string): LightningSchedule {
  return notImplemented(seed);
}

export interface Flash {
  /** Light added to the scene, 0 … MAX_FLASH_LIGHT. */
  readonly light: number;
  /** Sky brightening, 0–1. */
  readonly sky: number;
  /** Bolt visible (never with reduced motion). */
  readonly bolt: boolean;
}

/** Flash envelope at time t for the latest strike: ≤ 2 pulses 400 ms apart, capped; one soft pulse with reduced motion. */
export function flashLevel(t: number, strike: Strike | null, opts: { readonly reducedMotion: boolean }): Flash {
  return notImplemented(t, strike, opts);
}
