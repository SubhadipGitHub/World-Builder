import { describe, expect, it } from 'vitest';
import { DEPARTURE_BACKLOG_PER_GATE, crewFactor, surge } from '../../../src/config/scenarios';
import { rates } from '../../../src/config/rates';
import type { SimEvent } from '../../../src/sim/events';
import { createSim, type Command, type Sim } from '../../../src/sim/world';

// What-if levers inside the full simulation (requirements §9, architecture §17).

const SIM_SEC_PER_STEP = rates.stepWallSec * rates.timeScale;

const run = (sim: Sim, n: number, each?: (i: number) => void): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    sim.step();
    events.push(...sim.drainEvents());
    each?.(i);
  }
  return events;
};

const unit = (sim: Sim, id: string) => {
  const r = sim.snapshot().resources.find((x) => x.id === id);
  if (!r) throw new Error(`no unit ${id}`);
  return r;
};

describe('scenario commands: determinism (S-15, S-16)', () => {
  const log: readonly (readonly [number, Command])[] = [
    [50, { type: 'surge' }],
    [120, { type: 'setUnitOnline', unitId: 'wash1', online: false }],
    [200, { type: 'setWeather', mode: 'rain' }],
    [260, { type: 'setCrew', station: 'service', level: 'extra' }],
    [400, { type: 'resetScenario' }],
  ];
  const replay = (commands: readonly (readonly [number, Command])[]): Sim => {
    const sim = createSim({ seed: 'goldlane' });
    for (let i = 0; i < 600; i++) {
      for (const [at, c] of commands) if (at === i) sim.apply(c);
      sim.step();
      sim.drainEvents();
    }
    return sim;
  };

  it('replays identically from the same seed and command log', () => {
    const a = replay(log);
    const b = replay(log);
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
    expect(a.metrics()).toEqual(b.metrics());
  });

  it('a baseline fed only the non-scenario commands equals a run that never had a scenario', () => {
    const weatherOnly = log.filter(([, c]) => c.type === 'setWeather');
    replay(log); // a scenario run in the same process must not leak into others
    const baseline = replay(weatherOnly);
    const pristine = replay(weatherOnly);
    expect(JSON.stringify(baseline.snapshot())).toBe(JSON.stringify(pristine.snapshot()));
  });

  it('diverges from the baseline once a lever changes the run', () => {
    const scenario = replay(log);
    const baseline = replay(log.filter(([, c]) => c.type === 'setWeather'));
    expect(JSON.stringify(scenario.snapshot().agents)).not.toBe(JSON.stringify(baseline.snapshot().agents));
  });
});

describe('scenario commands: outages (S-2)', () => {
  it('marks the unit offline, lets its occupant finish, then never grants it again', () => {
    const sim = createSim({ seed: 7 });
    run(sim, 200);
    sim.apply({ type: 'setUnitOnline', unitId: 'wash1', online: false });
    expect(unit(sim, 'wash1').online).toBe(false);
    expect(unit(sim, 'wash2').online).toBe(true);
    expect(sim.snapshot().scenario.offline).toEqual(['wash1']);

    const before = unit(sim, 'wash1').occupantId;
    const wash2Users = new Set<string>();
    const wash1Users = new Set<string>();
    run(sim, 4_000, () => {
      const w1 = unit(sim, 'wash1').occupantId;
      const w2 = unit(sim, 'wash2').occupantId;
      if (w1 && w1 !== before) wash1Users.add(w1);
      if (w2) wash2Users.add(w2);
    });
    expect([...wash1Users]).toEqual([]);
    expect(wash2Users.size).toBeGreaterThanOrEqual(3);
  });

  it('rejects closing the last unit of a station and keeps it online', () => {
    const sim = createSim({ seed: 8 });
    sim.apply({ type: 'setUnitOnline', unitId: 'gate1', online: false });
    sim.apply({ type: 'setUnitOnline', unitId: 'gate2', online: false });
    sim.step();
    const changes = sim.drainEvents().flatMap((e) => (e.type === 'scenario' ? [[e.change, e.unitId]] : []));
    expect(changes).toEqual([
      ['unitOffline', 'gate1'],
      ['rejected', 'gate2'],
    ]);
    expect(unit(sim, 'gate2').online).toBe(true);
  });

  it('brings units back online on reset', () => {
    const sim = createSim({ seed: 9 });
    sim.apply({ type: 'setUnitOnline', unitId: 'charger4', online: false });
    sim.apply({ type: 'resetScenario' });
    expect(unit(sim, 'charger4').online).toBe(true);
    expect(sim.snapshot().scenario.active).toBe(false);
  });
});

describe('scenario commands: crews (S-3)', () => {
  /** Wash durations from the progress slope of jobs that start after the change. */
  function washDurations(sim: Sim, steps: number): number[] {
    const first = new Map<string, { t: number; p: number }>();
    const out: number[] = [];
    run(sim, steps, () => {
      const snap = sim.snapshot();
      for (const r of snap.resources) {
        if (r.kind !== 'wash' || r.occupantId === null || r.progress === null) continue;
        const key = `${r.id}:${r.occupantId}`;
        const seen = first.get(key);
        if (!seen) {
          if (r.progress < 0.05) first.set(key, { t: snap.simTimeSec, p: r.progress });
        } else if (r.progress > 0.6 && r.progress < 1) {
          out.push((snap.simTimeSec - seen.t) / (r.progress - seen.p));
          first.set(key, { t: Infinity, p: 0 });
        }
      }
    });
    return out.filter((d) => Number.isFinite(d) && d > 0);
  }

  it('short-staffed washes take ×1.5 as long', () => {
    const sim = createSim({ seed: 11 });
    sim.apply({ type: 'setCrew', station: 'wash', level: 'short' });
    const d = washDurations(sim, 6_000);
    expect(d.length).toBeGreaterThanOrEqual(3);
    for (const x of d) {
      expect(x).toBeGreaterThanOrEqual(rates.washSimSec.min * crewFactor.short - 2 * SIM_SEC_PER_STEP);
      expect(x).toBeLessThanOrEqual(rates.washSimSec.max * crewFactor.short + 2 * SIM_SEC_PER_STEP);
    }
    expect(Math.max(...d)).toBeGreaterThan(rates.washSimSec.max);
  });

  it('extra crew washes take ×0.7 as long', () => {
    const sim = createSim({ seed: 11 });
    sim.apply({ type: 'setCrew', station: 'wash', level: 'extra' });
    const d = washDurations(sim, 6_000);
    expect(d.length).toBeGreaterThanOrEqual(3);
    for (const x of d) expect(x).toBeLessThanOrEqual(rates.washSimSec.max * crewFactor.extra + 2 * SIM_SEC_PER_STEP);
  });
});

describe('scenario commands: surge (S-1)', () => {
  it('brings rentals back early compared with an identical run without it', () => {
    const surged = createSim({ seed: 12 });
    const twin = createSim({ seed: 12 });
    surged.apply({ type: 'surge' });
    // Arrivals queue on the entry road (back-pressure, W5), so the early returns trickle in over
    // about 50 simulated minutes rather than all at once.
    run(surged, 1_000);
    run(twin, 1_000);
    expect(twin.metrics().counts.onRent - surged.metrics().counts.onRent).toBeGreaterThanOrEqual(8);
  });

  it('counts down and ends with one surgeEnded event', () => {
    const sim = createSim({ seed: 13 });
    sim.apply({ type: 'surge' });
    expect(sim.snapshot().scenario.surgeRemainingSec).toBe(surge.durationSimSec);
    expect(sim.snapshot().scenario.active).toBe(true);
    const events = run(sim, Math.ceil(surge.durationSimSec / SIM_SEC_PER_STEP) + 2);
    const ends = events.filter((e) => e.type === 'scenario' && e.change === 'surgeEnded');
    expect(ends).toHaveLength(1);
    expect(sim.snapshot().scenario.surgeRemainingSec).toBeNull();
    expect(sim.snapshot().scenario.active).toBe(false);
  });

  it('emits surgeStarted and reflects levers in the snapshot view', () => {
    const sim = createSim({ seed: 14 });
    sim.apply({ type: 'surge' });
    sim.apply({ type: 'setCrew', station: 'inspection', level: 'short' });
    sim.step();
    const changes = sim.drainEvents().flatMap((e) => (e.type === 'scenario' ? [e.change] : []));
    expect(changes).toEqual(['surgeStarted', 'crewChanged']);
    expect(sim.snapshot().scenario.crews.inspection).toBe('short');
    expect(structuredClone(sim.snapshot())).toEqual(sim.snapshot());
  });
});

describe('departure back-pressure (S-2, W11)', () => {
  /** Departing cars plus customers walking to their car. */
  const backlog = (sim: Sim): number => {
    const agents = sim.snapshot().agents;
    return agents.filter((a) => a.kind === 'fleet' && a.state === 'departing').length + agents.filter((a) => a.kind === 'pedestrian').length;
  };

  it('keeps the gate backlog within the cap when a gate is closed, so customers wait at the counter', () => {
    const sim = createSim({ seed: 'soak-gateClosure' });
    sim.apply({ type: 'setUnitOnline', unitId: 'gate2', online: false });
    // Departures already under way when the gate closes drain first; after that the cap holds.
    let drained = false;
    let worst = 0;
    run(sim, 7_200, () => {
      const n = backlog(sim);
      if (n <= DEPARTURE_BACKLOG_PER_GATE) drained = true;
      if (drained) worst = Math.max(worst, n);
    });
    expect(drained).toBe(true);
    expect(worst).toBeLessThanOrEqual(DEPARTURE_BACKLOG_PER_GATE);
  });

  it('allows a larger backlog with both gates open', () => {
    const sim = createSim({ seed: 'soak-gateClosure' });
    let worst = 0;
    run(sim, 7_200, () => {
      worst = Math.max(worst, backlog(sim));
    });
    expect(worst).toBeLessThanOrEqual(2 * DEPARTURE_BACKLOG_PER_GATE);
  });
});

describe('counter queue (I-3)', () => {
  it('reports customers waiting at the counter, which grows when a closed gate holds them back', () => {
    const open = createSim({ seed: 'soak-gateClosure' });
    const closed = createSim({ seed: 'soak-gateClosure' });
    closed.apply({ type: 'setUnitOnline', unitId: 'gate2', online: false });
    let maxOpen = 0;
    let maxClosed = 0;
    for (let i = 0; i < 7_200; i++) {
      open.step();
      closed.step();
      open.drainEvents();
      closed.drainEvents();
      if (i % 50 === 0) {
        const a = open.snapshot().counterQueue;
        const b = closed.snapshot().counterQueue;
        expect(a).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(b)).toBe(true);
        maxOpen = Math.max(maxOpen, a);
        maxClosed = Math.max(maxClosed, b);
      }
    }
    expect(maxClosed).toBeGreaterThan(maxOpen);
    expect(maxClosed).toBeGreaterThan(0);
  });
});
