import type { WeatherMode } from '../config/weather';
import { notImplemented } from '../shared/notImplemented';

// Wind (M9, FE-13, architecture F11, F13). Pure and deterministic.

export interface Wind {
  /** Direction the wind blows towards, radians in the ground plane (0 = +x). */
  readonly dirRad: number;
  /** Mean strength, 0 calm … 1 gale. */
  readonly strength: number;
  /** Current gust on top of the mean, 0–1. */
  readonly gust: number;
}

/** Calm overnight and in fog, breezy in the afternoon, strong in a thunderstorm; smooth in time. */
export function windAt(clockHours: number, weather: WeatherMode, tSec: number): Wind {
  return notImplemented(clockHours, weather, tSec);
}
