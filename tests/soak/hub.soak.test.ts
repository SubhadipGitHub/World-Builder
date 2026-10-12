import { describe, expect, it } from 'vitest';
import { rates } from '../../src/config/rates';
import { weatherModes } from '../../src/config/weather';
import { createGridlockDetector, findOverlaps } from '../../src/sim/invariants';
import { createSim } from '../../src/sim/world';

// Architecture §8: full hub, 3 seeds × 4 weather modes × 2 simulated hours.
const SEEDS = [1, 2, 3];
const SIM_HOURS = 2;

describe('hub soak (L-4)', () => {
  for (const seed of SEEDS) {
    for (const mode of weatherModes) {
      it(`seed ${String(seed)}, ${mode}: no overlap, no gridlock, healthy KPIs`, () => {
        const sim = createSim({ seed, weather: mode });
        const gridlock = createGridlockDetector(rates.gridlockSimSec);
        const totalSteps = Math.round((SIM_HOURS * 3_600) / (rates.stepWallSec * rates.timeScale));
        let checkouts = 0;
        let staged = 0;

        for (let i = 0; i < totalSteps; i++) {
          sim.step();
          const overlaps = findOverlaps(sim.footprints());
          if (overlaps.length > 0) {
            throw new Error(`overlap at step ${String(i)}: ${JSON.stringify(overlaps)}`);
          }
          const snap = sim.snapshot();
          const stuck = gridlock.update(snap.agents.map((a) => ({ id: a.id, speed: a.speed, parked: a.parked })), snap.simTimeSec);
          if (stuck.length > 0) throw new Error(`gridlock at step ${String(i)}: ${stuck.join(', ')}`);
          for (const e of sim.drainEvents()) {
            if (e.type === 'checkout') checkouts++;
            if (e.type === 'milestone' && e.stage === 'staged') staged++;
          }
        }

        const m = sim.metrics();
        // At least 60% of the configured base demand gets through, in every weather.
        const floor = 0.6 * rates.pickupsPerSimHour * SIM_HOURS;
        expect(checkouts, 'checkouts in 2 h').toBeGreaterThanOrEqual(floor);
        expect(staged, 'cars staged in 2 h').toBeGreaterThanOrEqual(floor);
        expect(m.utilisation).toBeGreaterThan(0.3);
        expect(m.utilisation).toBeLessThan(0.95);
        expect(m.turnaroundMin).not.toBeNull();
        expect(m.turnaroundMin!).toBeGreaterThan(10);
        expect(m.turnaroundMin!).toBeLessThan(180);
        if (m.readyEvSocPct !== null) expect(m.readyEvSocPct).toBeGreaterThanOrEqual(rates.evStageSocPct);
      });
    }
  }
});
