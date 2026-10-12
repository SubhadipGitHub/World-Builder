import { notImplemented } from '../shared/notImplemented';

export interface QualitySettings {
  readonly pixelRatioCap: number;
  /** 0 = shadows off. */
  readonly shadowMapSize: number;
  readonly shimmer: boolean;
}

/** Tier 0: 2.0 / 2048 / shimmer · Tier 1: 1.5 / 1024 / no shimmer · Tier 2: 1.0 / off / no shimmer. */
export function settingsFor(tier: number): QualitySettings {
  return notImplemented(tier);
}

/**
 * Adaptive quality (N-2, architecture §6). Frame times are averaged over windows of
 * `windowSec` (default 2) of accumulated frame time; a window averaging over 22 ms steps
 * down one tier (max 2), under 12 ms steps up one (min 0). One change per window.
 */
export interface QualityController {
  readonly tier: number;
  /** Feeds one frame's duration in seconds; returns the (possibly new) tier. */
  sample(frameSec: number): number;
}

/** Touch devices start at tier 1. */
export function createQualityController(options: { readonly touch: boolean; readonly windowSec?: number }): QualityController {
  return notImplemented(options);
}
