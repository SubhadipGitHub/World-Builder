import { describe, expect, it } from 'vitest';
import { rates } from '../../src/config/rates';
import { presets } from '../../src/config/scenarios';
import { createGridlockDetector, findOverlaps } from '../../src/sim/invariants';
import { createSim } from '../../src/sim/world';
import { presetCommands } from '../../src/ui/scenario';

// Architecture §17.5: every preset holds for 4 simulated hours, then Reset and 2 more hours.
// No overlap, no gridlock, and the hub keeps checking cars out after the reset.
const SCENARIO_HOURS = 4;
const RECOVERY_HOURS = 2;
const stepsFor = (hours: number): number => Math.round((hours * 3_600) / (rates.stepWallSec * rates.timeScale));

describe('scenario soak (S-2, L-4)', () => {
  for (const preset of presets) {
    it(`${preset.label}: no overlap or gridlock, and recovery after reset`, () => {
      const sim = createSim({ seed: `soak-${preset.id}` });
      const plan = presetCommands(preset.id);
      if (plan.weather) sim.apply({ type: 'setWeather', mode: plan.weather });
      for (const c of plan.commands) sim.apply(c);

      const gridlock = createGridlockDetector(rates.gridlockSimSec);
      const scenarioSteps = stepsFor(SCENARIO_HOURS);
      const total = scenarioSteps + stepsFor(RECOVERY_HOURS);
      let checkoutsAfterReset = 0;
      let rejected = 0;

      for (let i = 0; i < total; i++) {
        if (i === scenarioSteps) {
          sim.apply({ type: 'resetScenario' });
          sim.apply({ type: 'setWeather', mode: 'clear' });
        }
        sim.step();
        const overlaps = findOverlaps(sim.footprints());
        if (overlaps.length > 0) throw new Error(`overlap at step ${String(i)}: ${JSON.stringify(overlaps)}`);
        const snap = sim.snapshot();
        const stuck = gridlock.update(
          snap.agents.map((a) => ({ id: a.id, speed: a.speed, parked: a.parked })),
          snap.simTimeSec,
        );
        if (stuck.length > 0) throw new Error(`gridlock at step ${String(i)}: ${stuck.join(', ')}`);
        for (const e of sim.drainEvents()) {
          if (e.type === 'checkout' && i >= scenarioSteps) checkoutsAfterReset++;
          if (e.type === 'scenario' && e.change === 'rejected') rejected++;
        }
      }

      expect(rejected, 'preset commands are all valid').toBe(0);
      expect(sim.snapshot().scenario.active).toBe(false);
      // After recovery the hub serves at least half its base demand again.
      expect(checkoutsAfterReset).toBeGreaterThanOrEqual(0.5 * rates.pickupsPerSimHour * RECOVERY_HOURS);
    });
  }
});
