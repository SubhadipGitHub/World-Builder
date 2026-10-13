import { describe, expect, it } from 'vitest';
import { createFlightSchedule, type AircraftPose } from '../../../src/airport/flights';
import { phaseChanges } from '../../../src/airport/phases';

// M9 (FE-14, FE-16): take-off and touchdown detected once per movement, for jet sounds and particles.

const pose = (id: string, phase: AircraftPose['phase'], x = 0): AircraftPose =>
  ({ id, airline: 'pacificGateway', x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, gear: 1, phase, gate: null }) as unknown as AircraftPose;

describe('phaseChanges', () => {
  it('reports aircraft whose phase changed, at their new position', () => {
    const out = phaseChanges([pose('a', 'taxiOut'), pose('b', 'parked')], [pose('a', 'takeoff', 120), pose('b', 'parked'), pose('c', 'approach')]);
    expect(out).toEqual([{ id: 'a', from: 'taxiOut', to: 'takeoff', x: 120, z: 0 }]);
  });

  it('sees each take-off and touchdown once over an airport hour', () => {
    const schedule = createFlightSchedule();
    let prev = schedule.aircraftAt(0);
    let takeoffs = 0;
    let landings = 0;
    for (let t = 0.5; t < 3600; t += 0.5) {
      const next = schedule.aircraftAt(t);
      for (const c of phaseChanges(prev, next)) {
        if (c.to === 'takeoff') takeoffs++;
        if (c.to === 'landing') landings++;
      }
      prev = next;
    }
    expect(takeoffs).toBeGreaterThan(5);
    expect(landings).toBeGreaterThan(5);
  });
});
