import { createRng } from '../sim/rng';

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
  const rng = createRng(`lightning:${seed}`);
  const strikes: Strike[] = [];
  // The first strike comes within 10 s, so a storm announces itself quickly.
  let next = rng.range(2, 10);
  const extendTo = (t: number): void => {
    while (next <= t) {
      strikes.push({
        t: next,
        seed: rng.int(0, 0x7fffffff),
        distanceM: rng.range(400, 1_500),
        thunderDelaySec: rng.range(1, 4),
        azimuthRad: rng.range(0, 2 * Math.PI),
      });
      next += rng.range(MIN_STRIKE_GAP_SEC, MAX_STRIKE_GAP_SEC);
    }
  };
  return {
    strikesBetween(t0, t1) {
      extendTo(t1);
      return strikes.filter((s) => s.t > t0 && s.t <= t1);
    },
    last(t) {
      extendTo(t);
      for (let i = strikes.length - 1; i >= 0; i--) {
        const s = strikes[i] as Strike;
        if (s.t <= t) return s;
      }
      return null;
    },
  };
}

export interface Flash {
  /** Light added to the scene, 0 … MAX_FLASH_LIGHT. */
  readonly light: number;
  /** Sky brightening, 0–1. */
  readonly sky: number;
  /** Bolt visible (never with reduced motion). */
  readonly bolt: boolean;
}

const DARK: Flash = { light: 0, sky: 0, bolt: false };
/** Second pulse after the first: 2.5 Hz, under the 3 Hz ceiling. */
const PULSE_GAP_SEC = 0.4;
const RISE_SEC = 0.08;
const DECAY_SEC = 0.09;
/** Everything is dark again after this. */
const FLASH_END_SEC = 1.5;
const BOLT_SEC = 0.25;

/** One pulse: a fast linear rise, then an exponential decay. */
const pulse = (x: number): number => (x < 0 ? 0 : x < RISE_SEC ? x / RISE_SEC : Math.exp(-(x - RISE_SEC) / DECAY_SEC));

/** Flash envelope at time t for the latest strike: ≤ 2 pulses 400 ms apart, capped; one soft pulse with reduced motion. */
export function flashLevel(t: number, strike: Strike | null, opts: { readonly reducedMotion: boolean }): Flash {
  if (!strike) return DARK;
  const dt = t - strike.t;
  if (opts.reducedMotion) {
    // One slow bump: 0.5 s up, 0.5 s down, no bolt and no flicker.
    if (dt < 0 || dt > 1) return DARK;
    const light = REDUCED_FLASH_LIGHT * Math.sin(Math.PI * dt);
    return { light, sky: light / MAX_FLASH_LIGHT, bolt: false };
  }
  if (dt < 0 || dt > FLASH_END_SEC) return DARK;
  const level = Math.min(1, pulse(dt) + 0.6 * pulse(dt - PULSE_GAP_SEC));
  return { light: MAX_FLASH_LIGHT * level, sky: level, bolt: dt < BOLT_SEC };
}
