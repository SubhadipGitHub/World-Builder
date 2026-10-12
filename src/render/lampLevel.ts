/** Lamps switch on when the night factor reaches this (dusk), and off below it (V-6). */
export const LAMPS_ON_AT = 0.5;
/** Fade of a single lamp, seconds. */
export const LAMP_FADE_SEC = 0.4;
/** Latest switch-on delay across the lamps, seconds. */
export const LAMP_MAX_DELAY_SEC = 3;

const GOLDEN = 0.6180339887;

/** Deterministic per-lamp delay in [0, LAMP_MAX_DELAY_SEC), well spread across lamps. */
export function lampDelay(index: number): number {
  // Golden-ratio sequence: neighbouring lamps get very different delays, so the street twinkles on.
  const f = (index * GOLDEN + 0.137) % 1;
  return f * LAMP_MAX_DELAY_SEC;
}

/**
 * Brightness of lamp `index` in [0, 1], `secondsSinceSwitch` after the lamps were switched on
 * (lit = true) or off (lit = false). Each lamp waits its delay, then fades over LAMP_FADE_SEC.
 * With reduced motion (N-5) there is no stagger or fade: 1 when lit, else 0.
 */
export function lampLevel(lit: boolean, secondsSinceSwitch: number, index: number, reducedMotion: boolean): number {
  if (reducedMotion) return lit ? 1 : 0;
  const progress = Math.min(1, Math.max(0, (secondsSinceSwitch - lampDelay(index)) / LAMP_FADE_SEC));
  return lit ? progress : 1 - progress;
}
