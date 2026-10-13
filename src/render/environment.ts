import type { WeatherMode } from '../config/weather';
import type { Wind } from './wind';

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
  /** Fog weather (FE-11): dense fog, lamp halos. */
  readonly fog: boolean;
  /** Thunderstorm (FE-12): rain plus lightning and strong wind. */
  readonly storm: boolean;
  /** Morning ground mist, 0–1 (FE-11; clear and overcast only). */
  readonly mist: number;
  /** Wind for sway, flags, rain slant, clouds and the windsock (FE-13). */
  readonly wind: Wind;
  /** Lightning flash added to the scene light, 0–1, already capped (FE-12, F12). */
  readonly flash: number;
  /** Headlights and runway lights on in daytime (fog). */
  readonly headlightsByDay: boolean;
}

export interface EnvironmentOptions {
  readonly reducedMotion: boolean;
  /** 0 best … 2 lowest (render/quality). Shimmer needs tier 0. */
  readonly qualityTier: number;
  /** Wall-clock seconds for wind gusts (FE-13); 0 when omitted. */
  readonly tSec?: number;
  /** Lightning flash level from render/lightning `flashLevel` (FE-12); 0 when omitted. */
  readonly flash?: number;
}

const SUNRISE = 6;
const SUNSET = 19;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Night factor for a clock time: 1 h linear blends centred on sunrise and sunset. */
function nightAt(h: number): number {
  return h < 12 ? clamp01(SUNRISE + 0.5 - h) : clamp01(h - (SUNSET - 0.5));
}

interface WeatherLight {
  readonly sun: number;
  readonly ambient: number;
  readonly fog: number;
}

const WEATHER_LIGHT: Readonly<Record<WeatherMode, WeatherLight>> = {
  clear: { sun: 1, ambient: 1, fog: 0 },
  overcast: { sun: 0.45, ambient: 1.1, fog: 0.0007 },
  // Stage 3 (M9): fog and storm borrow overcast and rain lighting until Stage 4 tunes them (FE-11, FE-12).
  fog: { sun: 0.45, ambient: 1.1, fog: 0.0007 },
  rain: { sun: 0.3, ambient: 0.9, fog: 0.0015 },
  storm: { sun: 0.3, ambient: 0.9, fog: 0.0015 },
  heatwave: { sun: 1.25, ambient: 1, fog: 0.0004 },
};

/**
 * Lighting and weather parameters (X-1, X-2), a pure function of the inputs:
 *  - clear: baseline; overcast: weaker sun, more ambient, light haze; rain: dim, fog, wet;
 *    heatwave: strong warm sun, slight haze, heat.
 *  - night lowers sun and ambient light and raises nightFactor in every weather.
 */
export function environmentFor(weather: WeatherMode, clockHours: number, dayNight: DayNight, options: EnvironmentOptions): Environment {
  const hours = dayNight === 'day' ? 12 : dayNight === 'night' ? 22 : clockHours;
  const nightFactor = nightAt(hours);
  const w = WEATHER_LIGHT[weather];
  const day = 1 - nightFactor;
  const heat = weather === 'heatwave';
  return {
    hours,
    nightFactor,
    sunElevation: 1.1 * Math.sin((Math.PI * (hours - SUNRISE)) / (SUNSET - SUNRISE)),
    // Night keeps soft moonlight and ambient so the hub stays readable after tone mapping.
    sunIntensity: 2.6 * w.sun * day + 0.45 * nightFactor,
    ambientIntensity: 1.6 * w.ambient * day + 0.8 * nightFactor,
    fogDensity: w.fog,
    wetness: weather === 'rain' ? 1 : 0,
    rain: weather === 'rain',
    heat,
    shimmer: heat && !options.reducedMotion && options.qualityTier === 0,
    // Stage 3 placeholders (M9, FE-11…FE-13).
    fog: false,
    storm: false,
    mist: 0,
    wind: { dirRad: 0, strength: 0, gust: 0 },
    flash: 0,
    headlightsByDay: false,
  };
}
