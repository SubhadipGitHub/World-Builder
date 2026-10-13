import type { WeatherMode } from '../config/weather';

// Wind (M9, FE-13, architecture F11, F13). Pure and deterministic.

export interface Wind {
  /** Direction the wind blows towards, radians in the ground plane (0 = +x). */
  readonly dirRad: number;
  /** Mean strength, 0 calm … 1 gale. */
  readonly strength: number;
  /** Current gust on top of the mean, 0–1. */
  readonly gust: number;
}

/** How each weather scales the day's breeze, and how gusty it is. A storm has its own floor. */
const WEATHER_WIND: Readonly<Record<WeatherMode, { readonly scale: number; readonly gustiness: number }>> = {
  clear: { scale: 1, gustiness: 0.6 },
  overcast: { scale: 1.1, gustiness: 0.6 },
  fog: { scale: 0.2, gustiness: 0.2 },
  rain: { scale: 1.3, gustiness: 0.8 },
  storm: { scale: 1, gustiness: 1 },
  heatwave: { scale: 0.8, gustiness: 0.5 },
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Breeze from the time of day: 0 overnight, peaking at 1 mid-afternoon (07:00–21:00 sine). */
function diurnal(h: number): number {
  return h > 7 && h < 21 ? Math.sin((Math.PI * (h - 7)) / 14) : 0;
}

/** Calm overnight and in fog, breezy in the afternoon, strong in a thunderstorm; smooth in time. */
export function windAt(clockHours: number, weather: WeatherMode, tSec: number): Wind {
  const w = WEATHER_WIND[weather];
  const day = diurnal(clockHours);
  const strength = weather === 'storm' ? 0.65 + 0.25 * day : clamp01((0.1 + 0.35 * day) * w.scale);
  // Slow sum of sines: changes by well under 0.1 per second (no flicker in sway or sound).
  const g = 0.5 + 0.25 * Math.sin(tSec * 0.07) + 0.15 * Math.sin(tSec * 0.13 + 1.3) + 0.1 * Math.sin(tSec * 0.23 + 2.1);
  const gust = clamp01(g * w.gustiness);
  // Mostly an onshore westerly breeze, veering slowly through the day.
  const dirRad = 0.6 + 0.4 * Math.sin((clockHours / 24) * 2 * Math.PI) + 0.15 * Math.sin(tSec * 0.01);
  return { dirRad, strength, gust };
}
