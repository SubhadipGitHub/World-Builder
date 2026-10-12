import { describe, expect, it } from 'vitest';
import { facility } from '../../../src/config/facility';
import { rates } from '../../../src/config/rates';
import type { SimEvent } from '../../../src/sim/events';
import { findOverlaps } from '../../../src/sim/invariants';
import { TRACKER_STAGES, type TrackerStage } from '../../../src/sim/lifecycle';
import { createSim, type Sim } from '../../../src/sim/world';

const steps = (sim: Sim, n: number, each?: (i: number) => void): void => {
  for (let i = 0; i < n; i++) {
    sim.step();
    each?.(i);
  }
};

const fleetOnMap = (sim: Sim) => sim.snapshot().agents.filter((a) => a.kind === 'fleet');

describe('createSim: determinism (L-5)', () => {
  it('produces identical snapshots for the same seed', () => {
    const a = createSim({ seed: 'goldlane' });
    const b = createSim({ seed: 'goldlane' });
    steps(a, 1_200);
    steps(b, 1_200);
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
    expect(a.metrics()).toEqual(b.metrics());
  });

  it('produces different snapshots for different seeds', () => {
    const a = createSim({ seed: 1 });
    const b = createSim({ seed: 2 });
    steps(a, 300);
    steps(b, 300);
    expect(JSON.stringify(a.snapshot())).not.toBe(JSON.stringify(b.snapshot()));
  });

  it('returns structured-clone-safe snapshots (A1)', () => {
    const sim = createSim({ seed: 3 });
    steps(sim, 100);
    const snap = sim.snapshot();
    expect(structuredClone(snap)).toEqual(snap);
  });
});

describe('createSim: clocks (L-6, A2)', () => {
  it('advances simulated time by stepWallSec × timeScale per step', () => {
    const sim = createSim({ seed: 4 });
    steps(sim, 20);
    expect(sim.snapshot().simTimeSec).toBeCloseTo(20 * rates.stepWallSec * rates.timeScale, 6);
    sim.apply({ type: 'setTimeScale', value: 40 });
    steps(sim, 20);
    expect(sim.snapshot().simTimeSec).toBeCloseTo(20 + 20 * rates.stepWallSec * 40, 6);
    expect(sim.snapshot().timeScale).toBe(40);
  });

  it('keeps clockHours in [0, 24)', () => {
    const sim = createSim({ seed: 5, timeScale: 2_000 });
    steps(sim, 2_000, () => {
      const h = sim.snapshot().clockHours;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(24);
    });
  });
});

describe('createSim: fleet (L-2)', () => {
  it('starts mid-operation, so the hub looks alive within 3 seconds', () => {
    const sim = createSim({ seed: 6 });
    steps(sim, Math.round(3 / rates.stepWallSec));
    const fleet = fleetOnMap(sim);
    expect(fleet.length).toBeGreaterThanOrEqual(10);
    expect(fleet.filter((a) => a.speed > 0.5).length).toBeGreaterThanOrEqual(3);
  });

  it('conserves the fleet: on rent + on map = fleet size, with unique ids', () => {
    const sim = createSim({ seed: 7 });
    steps(sim, 3_000, (i) => {
      if (i % 100 !== 0) return;
      const m = sim.metrics();
      const onMap = fleetOnMap(sim);
      expect(m.counts.total).toBe(facility.fleetSize);
      expect(m.counts.onRent + onMap.length).toBe(facility.fleetSize);
      const ids = sim.snapshot().agents.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('reports a footprint for every on-map agent', () => {
    const sim = createSim({ seed: 8 });
    steps(sim, 500);
    const agentIds = sim.snapshot().agents.map((a) => a.id).sort();
    expect(sim.footprints().map((f) => f.id).sort()).toEqual(agentIds);
  });
});

describe('createSim: metrics (D-3)', () => {
  it('computes utilisation as on rent ÷ fleet and keeps stage counts consistent', () => {
    const sim = createSim({ seed: 9 });
    steps(sim, 2_400);
    const m = sim.metrics();
    expect(m.utilisation).toBeCloseTo(m.counts.onRent / facility.fleetSize, 10);
    const staged = Object.values(m.stageCounts).reduce((a, b) => a + b, 0);
    expect(staged).toBe(fleetOnMap(sim).filter((a) => a.stage !== null).length);
  });

  it('only stages EVs at or above the SoC threshold', () => {
    const sim = createSim({ seed: 10 });
    steps(sim, 3_600, (i) => {
      if (i % 200 !== 0) return;
      for (const a of fleetOnMap(sim)) {
        if (a.cls === 'ev' && a.state === 'staged') expect(a.socPct).toBeGreaterThanOrEqual(rates.evStageSocPct);
      }
    });
    const soc = sim.metrics().readyEvSocPct;
    if (soc !== null) expect(soc).toBeGreaterThanOrEqual(rates.evStageSocPct);
  });
});

describe('createSim: events (D-5, D-6, D-8)', () => {
  it('drains events once, in order', () => {
    const sim = createSim({ seed: 11 });
    steps(sim, 600);
    const first = sim.drainEvents();
    expect(first.length).toBeGreaterThan(0);
    expect(sim.drainEvents()).toEqual([]);
    for (let i = 1; i < first.length; i++) expect(first[i]!.simTimeSec).toBeGreaterThanOrEqual(first[i - 1]!.simTimeSec);
  });

  it('emits each vehicle’s milestones in tracker order', () => {
    const sim = createSim({ seed: 12 });
    const events: SimEvent[] = [];
    steps(sim, 3_600, () => events.push(...sim.drainEvents()));
    const byVehicle = new Map<string, TrackerStage[]>();
    for (const e of events) {
      if (e.type !== 'milestone') continue;
      byVehicle.set(e.vehicleId, [...(byVehicle.get(e.vehicleId) ?? []), e.stage]);
    }
    expect(byVehicle.size).toBeGreaterThan(0);
    for (const seq of byVehicle.values()) {
      for (let i = 1; i < seq.length; i++) {
        const prev = TRACKER_STAGES.indexOf(seq[i - 1]!);
        expect(TRACKER_STAGES.indexOf(seq[i]!)).toBe((prev + 1) % TRACKER_STAGES.length);
      }
    }
  });

  it('logs checkouts with fictional agreement numbers, valid tiers and a gate', () => {
    const sim = createSim({ seed: 13 });
    const events: SimEvent[] = [];
    steps(sim, 3_600, () => events.push(...sim.drainEvents()));
    const checkouts = events.filter((e) => e.type === 'checkout');
    expect(checkouts.length).toBeGreaterThan(0);
    for (const c of checkouts) {
      expect(c.agreementNo).toMatch(/^RA-\d{2}-\d{7}$/);
      expect(['Gold', 'Platinum']).toContain(c.tier);
      expect(c.gateId).not.toBe('');
    }
  });
});

describe('createSim: agreement numbers on departing cars (D-2 search)', () => {
  it('shows the agreement while a customer drives off, and null otherwise', () => {
    const sim = createSim({ seed: 16 });
    let seenDeparting = 0;
    steps(sim, 2_400, (i) => {
      if (i % 20 !== 0) return;
      for (const a of fleetOnMap(sim)) {
        if (a.state === 'departing') {
          seenDeparting++;
          expect(a.agreementNo).toMatch(/^RA-\d{2}-\d{7}$/);
        } else {
          expect(a.agreementNo).toBeNull();
        }
      }
    });
    expect(seenDeparting).toBeGreaterThan(0);
  });
});

describe('createSim: severe maintenance and the tow truck (L-1 severe path)', () => {
  it('tows a severe case to a service bay, details it there and sends it on, without overlaps', () => {
    const sim = createSim({ seed: 21, rateOverrides: { maintenanceChance: 1, severeChance: 1 } });
    let towed: string | null = null;
    let sawTowing = false;
    let washed = false;
    // One tow round trip plus up to 40 simulated minutes of repair; stop as soon as it is done.
    for (let i = 0; i < 12_000 && !washed; i++) {
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.type === 'towDispatched') towed ??= e.vehicleId;
        if (e.type === 'milestone' && e.vehicleId === towed && e.stage === 'washed') washed = true;
      }
      expect(findOverlaps(sim.footprints())).toEqual([]);
      if (sim.snapshot().agents.some((a) => a.parentId !== null)) sawTowing = true;
    }
    expect(towed).not.toBeNull();
    expect(sawTowing).toBe(true);
    // Washed = detailed in the service bay after the repair.
    expect(washed).toBe(true);
  });
});

describe('createSim: weather (X-1 simulation rules)', () => {
  const meanMovingSpeed = (mode: 'clear' | 'rain'): number => {
    const sim = createSim({ seed: 14, weather: mode });
    let sum = 0;
    let n = 0;
    steps(sim, 1_800, () => {
      for (const a of fleetOnMap(sim)) {
        if (a.speed > 0.5) {
          sum += a.speed;
          n++;
        }
      }
    });
    return sum / n;
  };

  it('slows traffic in heavy rain', () => {
    expect(meanMovingSpeed('rain') / meanMovingSpeed('clear')).toBeLessThan(0.92);
  });

  it('switches weather by command', () => {
    const sim = createSim({ seed: 15 });
    sim.apply({ type: 'setWeather', mode: 'heatwave' });
    expect(sim.snapshot().weather).toBe('heatwave');
  });
});
