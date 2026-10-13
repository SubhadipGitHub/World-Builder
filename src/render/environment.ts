import type { WeatherMode } from '../config/weather';
import { windAt, type Wind } from './wind';

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

/** Morning ground mist (FE-11): rises 04:30–05:30, lies until 08:30 and lifts by 09:30; clear and overcast only. */
function mistAt(h: number): number {
  if (h < 4.5 || h >= 9.5) return 0;
  if (h < 5.5) return h - 4.5;
  if (h <= 8.5) return 1;
  return 9.5 - h;
}
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
  // M9 (FE-11): dense, light-grey fog; FE-12: a storm is darker than rain, with a little more haze.
  fog: { sun: 0.35, ambient: 1.1, fog: 0.006 },
  rain: { sun: 0.3, ambient: 0.9, fog: 0.0015 },
  storm: { sun: 0.18, ambient: 0.75, fog: 0.002 },
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
  const wet = weather === 'rain' || weather === 'storm';
  return {
    hours,
    nightFactor,
    sunElevation: 1.1 * Math.sin((Math.PI * (hours - SUNRISE)) / (SUNSET - SUNRISE)),
    // Night keeps soft moonlight and ambient so the hub stays readable after tone mapping.
    sunIntensity: 2.6 * w.sun * day + 0.45 * nightFactor,
    ambientIntensity: 1.6 * w.ambient * day + 0.8 * nightFactor,
    fogDensity: w.fog,
    // Fog leaves the asphalt damp, not wet (no puddles or splashes).
    wetness: wet ? 1 : weather === 'fog' ? 0.3 : 0,
    rain: wet,
    heat,
    shimmer: heat && !options.reducedMotion && options.qualityTier === 0,
    fog: weather === 'fog',
    storm: weather === 'storm',
    mist: dayNight === 'auto' && (weather === 'clear' || weather === 'overcast') ? mistAt(hours) : 0,
    wind: windAt(hours, weather, options.tSec ?? 0),
    flash: weather === 'storm' ? clamp01(options.flash ?? 0) : 0,
    headlightsByDay: weather === 'fog',
  };
}
