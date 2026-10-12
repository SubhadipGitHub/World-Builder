import { notImplemented } from '../shared/notImplemented';
import type { WeatherMode } from '../config/weather';

export type DayNight = 'auto' | 'day' | 'night';

export interface Environment {
  /** Hours actually used for lighting (forced to 12 for 'day', 22 for 'night'). */
  readonly hours: number;
  /** 0 = full day, 1 = full night; 06:00 sunrise and 19:00 sunset, each blended over 1 h. */
  readonly nightFactor: number;
  /** Sun height above the horizon in radians (negative at night). */
  readonly sunElevation: number;
  readonly sunIntensity: number;
  readonly ambientIntensity: number;
  /** Exponential fog density (0 = none). */
  readonly fogDensity: number;
  /** 0 dry … 1 soaked (rain). */
  readonly wetness: number;
  readonly rain: boolean;
  readonly heat: boolean;
  /** Heat shimmer on: heatwave, motion allowed and quality tier permits it. */
  readonly shimmer: boolean;
}

export interface EnvironmentOptions {
  readonly reducedMotion: boolean;
  /** 0 best … 2 lowest (render/quality). Shimmer needs tier 0. */
  readonly qualityTier: number;
}

/**
 * Lighting and weather parameters (X-1, X-2), a pure function of the inputs:
 *  - clear: baseline; overcast: weaker sun, more ambient, light haze; rain: dim, fog, wet;
 *    heatwave: strong warm sun, slight haze, heat.
 *  - night lowers sun and ambient light and raises nightFactor in every weather.
 */
export function environmentFor(weather: WeatherMode, clockHours: number, dayNight: DayNight, options: EnvironmentOptions): Environment {
  return notImplemented(weather, clockHours, dayNight, options);
}
