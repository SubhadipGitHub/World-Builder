import type { WeatherMode } from './weather';

// What-if scenario settings (requirements §9, approved 2026-10-12).

export type CrewStation = 'inspection' | 'wash' | 'service';
export type CrewLevel = 'short' | 'normal' | 'extra';
export type PresetId = 'fridayRush' | 'washDown' | 'heatCharger' | 'gateClosure';

export const CREW_STATIONS: readonly CrewStation[] = ['inspection', 'wash', 'service'];
export const CREW_LEVELS: readonly CrewLevel[] = ['short', 'normal', 'extra'];

/** S-1: a flight bank lands. */
export const surge = {
  /** Rentals pulled forward to return now. */
  returns: 15,
  /** Pickup demand multiplier while the surge lasts. */
  pickupFactor: 2,
  durationSimSec: 3600,
} as const;

/**
 * Departure back-pressure (W11): customers wait at the counter instead of walking to their car once
 * this many departures (cars heading to the gates plus customers walking to them) are pending per
 * online gate. Keeps a gate backlog out of the lot aisles and the walkway. 9 since M7 (was 10): the
 * day-long soak found gate queues of 11–13 and a jam at 10, and 88% served in rain at 8.
 */
export const DEPARTURE_BACKLOG_PER_GATE = 9;

/** S-3: job-duration multipliers per crew level. */
export const crewFactor: Readonly<Record<CrewLevel, number>> = { short: 1.5, normal: 1, extra: 0.7 };

/** S-12: deltas stay visible this long after the scenario returns to normal. */
export const deltaLingerSimSec = 3600;

/** S-13: deltas smaller than these read "≈ normal" (minutes, percentage points, percentage points). */
export const noiseBand = { turnaround: 2, utilisation: 1, evSoc: 1 } as const;

/** Resource kinds that can be taken offline (S-2); slots and the tow bay cannot. */
export const OUTAGE_KINDS = ['returnLane', 'wash', 'service', 'charger', 'pump', 'gate'] as const;
export type OutageKind = (typeof OUTAGE_KINDS)[number];

export interface PresetLever {
  readonly surge?: true;
  readonly offline?: readonly string[];
  readonly crews?: Partial<Readonly<Record<CrewStation, CrewLevel>>>;
  readonly weather?: WeatherMode;
}

export interface Preset {
  readonly id: PresetId;
  readonly label: string;
  readonly levers: PresetLever;
}

/** S-4 named presets. */
export const presets: readonly Preset[] = [
  { id: 'fridayRush', label: 'Friday evening rush', levers: { surge: true, crews: { wash: 'short' } } },
  { id: 'washDown', label: 'Wash tunnel down', levers: { offline: ['wash1'], crews: { wash: 'short' } } },
  { id: 'heatCharger', label: 'Heatwave + charger fault', levers: { weather: 'heatwave', offline: ['charger1', 'charger2', 'charger3'] } },
  { id: 'gateClosure', label: 'Gate closure', levers: { offline: ['gate2'], crews: { inspection: 'short' } } },
];
