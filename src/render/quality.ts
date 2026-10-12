export interface QualitySettings {
  readonly pixelRatioCap: number;
  /** 0 = shadows off. */
  readonly shadowMapSize: number;
  readonly shimmer: boolean;
  /** Night bloom post effect (V-7). */
  readonly bloom: boolean;
  /** Sky cloud puffs (V-4). */
  readonly clouds: boolean;
  /** Share of lamps that draw a light pool (V-6). */
  readonly lampPoolFraction: number;
}

const TIERS: readonly QualitySettings[] = [
  { pixelRatioCap: 2, shadowMapSize: 2048, shimmer: true, bloom: true, clouds: true, lampPoolFraction: 1 },
  { pixelRatioCap: 1.5, shadowMapSize: 1024, shimmer: false, bloom: false, clouds: true, lampPoolFraction: 1 },
  { pixelRatioCap: 1, shadowMapSize: 0, shimmer: false, bloom: false, clouds: false, lampPoolFraction: 0.5 },
];

/**
 * Tier 0: 2.0 / 2048 / shimmer / bloom / clouds / all pools · Tier 1: 1.5 / 1024 / clouds / all pools ·
 * Tier 2: 1.0 / no shadows / no clouds / half the pools.
 */
export function settingsFor(tier: number): QualitySettings {
  return TIERS[Math.min(TIERS.length - 1, Math.max(0, Math.round(tier)))] as QualitySettings;
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

const SLOW = 0.022;
const FAST = 0.012;

/** Touch devices start at tier 1. */
export function createQualityController(options: { readonly touch: boolean; readonly windowSec?: number }): QualityController {
  const windowSec = options.windowSec ?? 2;
  let tier = options.touch ? 1 : 0;
  let elapsed = 0;
  let frames = 0;
  return {
    get tier() {
      return tier;
    },
    sample(frameSec) {
      if (!Number.isFinite(frameSec) || frameSec <= 0) return tier;
      elapsed += frameSec;
      frames++;
      if (elapsed >= windowSec - 1e-9) {
        const mean = elapsed / frames;
        if (mean > SLOW && tier < TIERS.length - 1) tier++;
        else if (mean < FAST && tier > 0) tier--;
        elapsed = 0;
        frames = 0;
      }
      return tier;
    },
  };
}
