import { notImplemented } from '../shared/notImplemented';
import type { AircraftPose, FlightPhase } from './flights';

// Aircraft phase transitions between frames (M9, FE-14, FE-16), for jet sounds and particles. Pure.

export interface PhaseChange {
  readonly id: string;
  readonly from: FlightPhase;
  readonly to: FlightPhase;
  readonly x: number;
  readonly z: number;
}

/** Aircraft present in both frames whose phase changed, at their new position. */
export function phaseChanges(prev: readonly AircraftPose[], next: readonly AircraftPose[]): PhaseChange[] {
  return notImplemented(prev, next);
}
