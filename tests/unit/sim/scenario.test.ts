import { describe, expect, it } from 'vitest';
import { crewFactor, surge } from '../../../src/config/scenarios';
import {
  NORMAL_SCENARIO,
  canTakeOffline,
  createUnitCatalogue,
  durationFactor,
  isActive,
  pickupFactor,
  reduceScenario,
  scenarioView,
  tickScenario,
  type ScenarioCommand,
  type ScenarioState,
} from '../../../src/sim/scenario';

const units = createUnitCatalogue({
  returnLane: ['lane1', 'lane2'],
  wash: ['wash1', 'wash2'],
  charger: ['charger1', 'charger2', 'charger3'],
  gate: ['gate1', 'gate2'],
});

const apply = (state: ScenarioState, command: ScenarioCommand, now = 100) => reduceScenario(state, command, { now, units });

describe('createUnitCatalogue', () => {
  it('maps units to their outage kind and lists units per kind', () => {
    expect(units.kindOf('wash2')).toBe('wash');
    expect(units.kindOf('charger3')).toBe('charger');
    expect(units.kindOf('sedan-01')).toBeNull();
    expect(units.kindOf('towbay1')).toBeNull();
    expect(units.unitsOf('gate')).toEqual(['gate1', 'gate2']);
    expect(units.unitsOf('pump')).toEqual([]);
  });
});

describe('reduceScenario: outages (S-2, W4)', () => {
  it('takes a unit offline and back online, emitting events and toggles', () => {
    const off = apply(NORMAL_SCENARIO, { type: 'setUnitOnline', unitId: 'wash1', online: false });
    expect([...off.state.offline]).toEqual(['wash1']);
    expect(off.toggled).toEqual([{ unitId: 'wash1', online: false }]);
    expect(off.events).toEqual([{ type: 'scenario', change: 'unitOffline', unitId: 'wash1', simTimeSec: 100 }]);
    expect(off.state.lastChangeAt).toBe(100);

    const on = apply(off.state, { type: 'setUnitOnline', unitId: 'wash1', online: true }, 200);
    expect(on.state.offline.size).toBe(0);
    expect(on.toggled).toEqual([{ unitId: 'wash1', online: true }]);
    expect(on.events).toEqual([{ type: 'scenario', change: 'unitOnline', unitId: 'wash1', simTimeSec: 200 }]);
  });

  it('refuses to take the last online unit of a station offline', () => {
    const one = apply(NORMAL_SCENARIO, { type: 'setUnitOnline', unitId: 'wash1', online: false }).state;
    const r = apply(one, { type: 'setUnitOnline', unitId: 'wash2', online: false });
    expect(r.state).toBe(one);
    expect(r.toggled).toEqual([]);
    expect(r.events).toEqual([{ type: 'scenario', change: 'rejected', unitId: 'wash2', simTimeSec: 100 }]);
  });

  it('rejects unknown and non-outage-able units', () => {
    for (const unitId of ['nope', 'sedan-01', 'towbay1']) {
      const r = apply(NORMAL_SCENARIO, { type: 'setUnitOnline', unitId, online: false });
      expect(r.state).toBe(NORMAL_SCENARIO);
      expect(r.events.map((e) => e.change)).toEqual(['rejected']);
    }
  });

  it('treats a toggle to the current state as a silent no-op', () => {
    const r = apply(NORMAL_SCENARIO, { type: 'setUnitOnline', unitId: 'gate1', online: true });
    expect(r.state).toBe(NORMAL_SCENARIO);
    expect(r.events).toEqual([]);
    expect(r.toggled).toEqual([]);
  });

  it('canTakeOffline follows the same rule', () => {
    expect(canTakeOffline(NORMAL_SCENARIO, 'charger1', units)).toBe(true);
    const two = apply(apply(NORMAL_SCENARIO, { type: 'setUnitOnline', unitId: 'charger1', online: false }).state, {
      type: 'setUnitOnline',
      unitId: 'charger2',
      online: false,
    }).state;
    expect(canTakeOffline(two, 'charger3', units)).toBe(false);
    expect(canTakeOffline(two, 'charger1', units)).toBe(false); // already offline
    expect(canTakeOffline(NORMAL_SCENARIO, 'sedan-01', units)).toBe(false);
    expect(canTakeOffline(NORMAL_SCENARIO, 'nope', units)).toBe(false);
  });
});

describe('reduceScenario: crews (S-3)', () => {
  it('sets a crew level and reports it', () => {
    const r = apply(NORMAL_SCENARIO, { type: 'setCrew', station: 'wash', level: 'short' });
    expect(r.state.crews).toEqual({ inspection: 'normal', wash: 'short', service: 'normal' });
    expect(r.events).toEqual([{ type: 'scenario', change: 'crewChanged', station: 'wash', level: 'short', simTimeSec: 100 }]);
  });

  it('durationFactor maps levels to multipliers', () => {
    const short = apply(NORMAL_SCENARIO, { type: 'setCrew', station: 'service', level: 'short' }).state;
    const extra = apply(short, { type: 'setCrew', station: 'inspection', level: 'extra' }).state;
    expect(durationFactor(extra, 'service')).toBe(crewFactor.short);
    expect(durationFactor(extra, 'inspection')).toBe(crewFactor.extra);
    expect(durationFactor(extra, 'wash')).toBe(1);
  });
});

describe('reduceScenario: surge (S-1)', () => {
  it('opens a 60-minute window with doubled pickups', () => {
    const r = apply(NORMAL_SCENARIO, { type: 'surge' }, 1_000);
    expect(r.surgeStarted).toBe(true);
    expect(r.state.surgeUntil).toBe(1_000 + surge.durationSimSec);
    expect(r.events).toEqual([{ type: 'scenario', change: 'surgeStarted', simTimeSec: 1_000 }]);
    expect(pickupFactor(r.state, 1_000)).toBe(surge.pickupFactor);
    expect(pickupFactor(r.state, 1_000 + surge.durationSimSec - 1)).toBe(surge.pickupFactor);
    expect(pickupFactor(r.state, 1_000 + surge.durationSimSec)).toBe(1);
    expect(pickupFactor(NORMAL_SCENARIO, 1_000)).toBe(1);
  });

  it('restarts the window when triggered again', () => {
    const first = apply(NORMAL_SCENARIO, { type: 'surge' }, 1_000).state;
    const again = apply(first, { type: 'surge' }, 2_000);
    expect(again.surgeStarted).toBe(true);
    expect(again.state.surgeUntil).toBe(2_000 + surge.durationSimSec);
  });

  it('tickScenario ends the surge once, with one event', () => {
    const s = apply(NORMAL_SCENARIO, { type: 'surge' }, 0).state;
    expect(tickScenario(s, surge.durationSimSec - 1).events).toEqual([]);
    const ended = tickScenario(s, surge.durationSimSec);
    expect(ended.state.surgeUntil).toBeNull();
    expect(ended.state.lastChangeAt).toBe(surge.durationSimSec);
    expect(ended.events).toEqual([{ type: 'scenario', change: 'surgeEnded', simTimeSec: surge.durationSimSec }]);
    expect(tickScenario(ended.state, surge.durationSimSec + 5).events).toEqual([]);
    expect(tickScenario(NORMAL_SCENARIO, 10).state).toBe(NORMAL_SCENARIO);
  });
});

describe('reduceScenario: reset (S-5)', () => {
  it('returns every lever to normal and brings units back online', () => {
    let s = apply(NORMAL_SCENARIO, { type: 'surge' }, 0).state;
    s = apply(s, { type: 'setUnitOnline', unitId: 'gate2', online: false }).state;
    s = apply(s, { type: 'setCrew', station: 'wash', level: 'extra' }).state;
    const r = apply(s, { type: 'resetScenario' }, 500);
    expect([...r.state.offline]).toEqual([]);
    expect(r.state.crews).toEqual(NORMAL_SCENARIO.crews);
    expect(r.state.surgeUntil).toBeNull();
    expect(r.state.lastChangeAt).toBe(500);
    expect(r.toggled).toEqual([{ unitId: 'gate2', online: true }]);
    expect(r.events).toEqual([{ type: 'scenario', change: 'reset', simTimeSec: 500 }]);
  });

  it('is a no-op when already normal', () => {
    const r = apply(NORMAL_SCENARIO, { type: 'resetScenario' });
    expect(r.state).toBe(NORMAL_SCENARIO);
    expect(r.events).toEqual([]);
  });
});

describe('isActive and scenarioView', () => {
  it('is inactive at normal and active while any lever is set', () => {
    expect(isActive(NORMAL_SCENARIO, 0)).toBe(false);
    expect(isActive(apply(NORMAL_SCENARIO, { type: 'setCrew', station: 'wash', level: 'short' }).state, 0)).toBe(true);
    expect(isActive(apply(NORMAL_SCENARIO, { type: 'setUnitOnline', unitId: 'lane1', online: false }).state, 0)).toBe(true);
    const surging = apply(NORMAL_SCENARIO, { type: 'surge' }, 0).state;
    expect(isActive(surging, 10)).toBe(true);
    expect(isActive(surging, surge.durationSimSec)).toBe(false);
  });

  it('gives a sorted, plain view with the surge time left', () => {
    let s = apply(NORMAL_SCENARIO, { type: 'surge' }, 0).state;
    s = apply(s, { type: 'setUnitOnline', unitId: 'gate2', online: false }).state;
    s = apply(s, { type: 'setUnitOnline', unitId: 'charger1', online: false }, 120).state;
    const v = scenarioView(s, 600);
    expect(v).toEqual({
      offline: ['charger1', 'gate2'],
      crews: NORMAL_SCENARIO.crews,
      surgeRemainingSec: surge.durationSimSec - 600,
      active: true,
      lastChangeAt: 120,
    });
    expect(structuredClone(v)).toEqual(v);
    expect(scenarioView(NORMAL_SCENARIO, 0)).toEqual({ offline: [], crews: NORMAL_SCENARIO.crews, surgeRemainingSec: null, active: false, lastChangeAt: null });
  });
});
