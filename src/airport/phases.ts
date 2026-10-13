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
  const before = new Map(prev.map((a) => [a.id, a.phase]));
  const out: PhaseChange[] = [];
  for (const a of next) {
    const from = before.get(a.id);
    if (from !== undefined && from !== a.phase) out.push({ id: a.id, from, to: a.phase, x: a.x, z: a.z });
  }
  return out;
}
