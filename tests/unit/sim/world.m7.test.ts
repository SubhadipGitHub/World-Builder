import { describe, expect, it } from 'vitest';
import { rates } from '../../../src/config/rates';
import { surge } from '../../../src/config/scenarios';
import { weather } from '../../../src/config/weather';
import { dayCurve } from '../../../src/sim/demand';
import { shouldChargeLater } from '../../../src/sim/energy';
import { createGridlockDetector, findOverlaps } from '../../../src/sim/invariants';
import { createSim, type Sim } from '../../../src/sim/world';
import { presetCommands } from '../../../src/ui/scenario';

// Requirements R-1, R-2, R-7, D30; architecture §20 K1–K4, K7.

const SIM_PER_STEP = rates.stepWallSec * rates.timeScale;

interface Cycle {
  driveIn: number;
  work: number;
  leave: number;
}

/** Unit cycles from the resource views: promotion → work start → work end → release. */
function cycles(sim: Sim, unit: string, steps: number, each?: () => void): Cycle[] {
  const out: Cycle[] = [];
  let occ: string | null = null;
  let grant = 0;
  let work = 0;
  let done = 0;
  for (let i = 0; i < steps; i++) {
    sim.step();
    sim.drainEvents();
    each?.();
    const s = sim.snapshot();
    const r = s.resources.find((x) => x.id === unit);
    if (!r) throw new Error(unit);
    const t = s.simTimeSec;
    if (r.occupantId !== occ) {
      if (occ && work && done) out.push({ driveIn: work - grant, work: done - work, leave: t - done });
      occ = r.occupantId;
      grant = t;
      work = 0;
      done = 0;
    }
    if (occ && r.progress !== null && !work) work = t;
    if (occ && work && r.progress === null && !done) done = t;
  }
  return out;
}

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

describe('M7 clock (D30, K1)', () => {
  it('runs the hub clock at 15× real time', () => {
    expect(rates.timeScale).toBe(15);
    const sim = createSim({ seed: 1 });
    sim.step();
    expect(sim.snapshot().simTimeSec).toBeCloseTo(SIM_PER_STEP, 9);
  });
});

describe('faster gate cycle (R-1, R-2, K2–K4)', () => {
  const sim = createSim({ seed: 'goldlane' });
  const gate = cycles(sim, 'gate1', 6_000);

  it('dwells 8–15 simulated seconds at the gate', () => {
    expect(gate.length).toBeGreaterThanOrEqual(8);
    for (const c of gate) {
      expect(c.work).toBeGreaterThanOrEqual(8 - SIM_PER_STEP);
      expect(c.work).toBeLessThanOrEqual(15 + 2 * SIM_PER_STEP);
    }
  });

  it('frees the gate as soon as the car pulls away (front off the lane)', () => {
    expect(mean(gate.map((c) => c.leave))).toBeLessThanOrEqual(15);
  });

  it('lets saturated gates turn at least 25 cars per simulated hour (was about 18–20)', () => {
    // A staged car still needs ~9 real seconds to pull up behind an accelerating leader (vehicle
    // dynamics), so capacity is the meaningful measure (§20.7), not the drive-in time.
    const busy = createSim({ seed: 'goldlane', weather: 'heatwave' });
    busy.apply({ type: 'surge' });
    let checkouts = 0;
    const start = busy.snapshot().simTimeSec;
    for (let i = 0; i < 4_800; i++) {
      busy.step();
      for (const e of busy.drainEvents()) if (e.type === 'checkout') checkouts++;
    }
    const hours = (busy.snapshot().simTimeSec - start) / 3600;
    expect(checkouts / hours).toBeGreaterThanOrEqual(25);
    expect(gate.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('roll-up staging stays safe (K3, L-4)', () => {
  it('never overlaps while cars are staged behind occupied units', () => {
    const sim = createSim({ seed: 3 });
    sim.apply({ type: 'surge' });
    let staged = 0;
    for (let i = 0; i < 4_000; i++) {
      sim.step();
      sim.drainEvents();
      const overlaps = findOverlaps(sim.footprints());
      if (overlaps.length > 0) throw new Error(`overlap at step ${String(i)}: ${JSON.stringify(overlaps)}`);
      if (i % 20 === 0) staged += sim.snapshot().agents.filter((a) => a.task.startsWith('Waiting behind')).length;
    }
    expect(staged).toBeGreaterThan(0);
  });
});

describe('snapshot demand (R-7, K7)', () => {
  it('reports the day curve at the hub hour, times weather and surge', () => {
    const sim = createSim({ seed: 4 });
    const s0 = sim.snapshot();
    expect(s0.demand.factor).toBeCloseTo(dayCurve(s0.clockHours), 6);
    expect(s0.demand.period).toBe('Morning peak');
    sim.apply({ type: 'setWeather', mode: 'heatwave' });
    sim.apply({ type: 'surge' });
    const s1 = sim.snapshot();
    expect(s1.demand.factor).toBeCloseTo(dayCurve(s1.clockHours) * weather.heatwave.demandFactor * surge.pickupFactor, 6);
    expect(structuredClone(s1)).toEqual(s1);
  });
});

describe('charge-later policy (R-8, D33)', () => {
  it('skips charging only for cars at ≥ 50% when 4 or more are already waiting', () => {
    expect(shouldChargeLater(50, 4)).toBe(true);
    expect(shouldChargeLater(80, 9)).toBe(true);
    expect(shouldChargeLater(49.9, 9)).toBe(false);
    expect(shouldChargeLater(90, 3)).toBe(false);
  });

  it('under a heatwave surge some cars skip the energy stage, all of them at ≥ 50%', () => {
    const sim = createSim({ seed: 2, weather: 'heatwave' });
    sim.apply({ type: 'surge' });
    const stages = new Map<string, string[]>();
    let skipped = 0;
    for (let i = 0; i < 9_000; i++) {
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.type !== 'milestone') continue;
        const list = stages.get(e.vehicleId) ?? [];
        list.push(e.stage);
        stages.set(e.vehicleId, list);
        if (e.stage === 'staged' && list.includes('washed') && !list.includes('energised')) {
          skipped++;
          const car = sim.snapshot().agents.find((a) => a.id === e.vehicleId);
          expect(car?.socPct ?? car?.fuelPct ?? 0).toBeGreaterThanOrEqual(50);
        }
        if (e.stage === 'dispatched') stages.delete(e.vehicleId);
      }
    }
    expect(skipped).toBeGreaterThan(0);
  }, 120_000);
});

describe('queued nose-to-tail (D36)', () => {
  it('counts a car stopped right behind a queued car on its way to its unit as queued', () => {
    // Wash tunnel down at the morning peak: the wash queue backs up through the return lanes.
    const sim = createSim({ seed: 'soak-washDown' });
    for (const c of presetCommands('washDown').commands) sim.apply(c);
    let queuedDrivers = 0;
    for (let i = 0; i < 6_200; i++) {
      sim.step();
      sim.drainEvents();
      if (i % 50 !== 0) continue;
      for (const a of sim.snapshot().agents) {
        if (a.kind === 'fleet' && a.task.startsWith('Driving to') && a.speed <= 0.1 && a.parked) queuedDrivers++;
      }
    }
    expect(queuedDrivers).toBeGreaterThan(0);
  }, 60_000);

  it('counts a car waiting for its unit to clear behind a queued leaver as queued', () => {
    // Gate 2 closed at the morning peak: the energy queue backs up onto the wash exits, so a car
    // leaving a wash bay sits part-way out of it (K2) and the next car waits at the bay entrance.
    const sim = createSim({ seed: 'soak-gateClosure' });
    for (const c of presetCommands('gateClosure').commands) sim.apply(c);
    const gridlock = createGridlockDetector(rates.gridlockSimSec);
    for (let i = 0; i < 5_400; i++) {
      sim.step();
      sim.drainEvents();
      const snap = sim.snapshot();
      const stuck = gridlock.update(
        snap.agents.map((a) => ({ id: a.id, speed: a.speed, parked: a.parked })),
        snap.simTimeSec,
      );
      expect(stuck, `step ${String(i)}`).toEqual([]);
    }
  }, 60_000);
});
