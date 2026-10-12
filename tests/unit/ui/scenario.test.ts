import { describe, expect, it } from 'vitest';
import { deltaLingerSimSec } from '../../../src/config/scenarios';
import {
  createWeatherMemory,
  deltaVisible,
  isOutageable,
  kpiDelta,
  offlineReason,
  outageGroups,
  presetCommands,
  queueSummary,
  scenarioChips,
} from '../../../src/ui/scenario';
import { idleScenario, resource, snapshot } from './fixtures';

describe('presetCommands (S-4)', () => {
  it('starts from normal, then applies surge, outages and crews in order', () => {
    expect(presetCommands('fridayRush')).toEqual({
      commands: [{ type: 'resetScenario' }, { type: 'surge' }, { type: 'setCrew', station: 'wash', level: 'short' }],
    });
    expect(presetCommands('washDown')).toEqual({
      commands: [
        { type: 'resetScenario' },
        { type: 'setUnitOnline', unitId: 'wash1', online: false },
        { type: 'setCrew', station: 'wash', level: 'short' },
      ],
    });
    expect(presetCommands('heatCharger')).toEqual({
      commands: [
        { type: 'resetScenario' },
        { type: 'setUnitOnline', unitId: 'charger1', online: false },
        { type: 'setUnitOnline', unitId: 'charger2', online: false },
        { type: 'setUnitOnline', unitId: 'charger3', online: false },
      ],
      weather: 'heatwave',
    });
    expect(presetCommands('gateClosure').commands).toEqual([
      { type: 'resetScenario' },
      { type: 'setUnitOnline', unitId: 'gate2', online: false },
      { type: 'setCrew', station: 'inspection', level: 'short' },
    ]);
  });
});

describe('createWeatherMemory (S-5, W8)', () => {
  it('restores the weather a preset replaced, once', () => {
    const m = createWeatherMemory();
    m.onPreset('rain', 'heatwave');
    expect(m.takeRestore()).toBe('rain');
    expect(m.takeRestore()).toBeNull();
  });

  it('keeps the first remembered weather across consecutive presets', () => {
    const m = createWeatherMemory();
    m.onPreset('overcast', 'heatwave');
    m.onPreset('heatwave', 'heatwave');
    expect(m.takeRestore()).toBe('overcast');
  });

  it('remembers nothing for presets without weather, and a manual choice clears it', () => {
    const m = createWeatherMemory();
    m.onPreset('clear', undefined);
    expect(m.takeRestore()).toBeNull();
    m.onPreset('clear', 'heatwave');
    m.onManualWeather();
    expect(m.takeRestore()).toBeNull();
  });
});

describe('kpiDelta (S-12, S-13)', () => {
  it('formats signed deltas with units and tone per KPI', () => {
    expect(kpiDelta('turnaround', 53.4, 41.2)).toEqual({ text: '+12 min vs normal', tone: 'bad' });
    expect(kpiDelta('turnaround', 35, 41)).toEqual({ text: '−6 min vs normal', tone: 'good' });
    expect(kpiDelta('utilisation', 60, 65)).toEqual({ text: '−5 pts vs normal', tone: 'bad' });
    expect(kpiDelta('utilisation', 70.2, 65)).toEqual({ text: '+5 pts vs normal', tone: 'good' });
    expect(kpiDelta('evSoc', 78, 86)).toEqual({ text: '−8 pts vs normal', tone: 'bad' });
  });

  it('reads "≈ normal" inside the noise band', () => {
    expect(kpiDelta('turnaround', 42.9, 41)).toEqual({ text: '≈ normal', tone: 'neutral' });
    expect(kpiDelta('utilisation', 65.9, 65)).toEqual({ text: '≈ normal', tone: 'neutral' });
    expect(kpiDelta('evSoc', 85.5, 86)).toEqual({ text: '≈ normal', tone: 'neutral' });
  });

  it('is null when either value is unknown', () => {
    expect(kpiDelta('turnaround', null, 40)).toBeNull();
    expect(kpiDelta('evSoc', 80, null)).toBeNull();
  });
});

describe('deltaVisible (S-12)', () => {
  it('shows while active and lingers 60 simulated minutes after the last change', () => {
    expect(deltaVisible(idleScenario({ active: true, lastChangeAt: 0 }), 99_999)).toBe(true);
    expect(deltaVisible(idleScenario({ active: false, lastChangeAt: 1_000 }), 1_000 + deltaLingerSimSec - 1)).toBe(true);
    expect(deltaVisible(idleScenario({ active: false, lastChangeAt: 1_000 }), 1_000 + deltaLingerSimSec)).toBe(false);
    expect(deltaVisible(idleScenario(), 0)).toBe(false);
  });
});

describe('queueSummary (S-14)', () => {
  it('reports one queue length per station, ignoring pumps and slots', () => {
    const snap = snapshot(
      [],
      [
        resource({ id: 'lane1', kind: 'returnLane', queueLength: 4 }),
        resource({ id: 'lane2', kind: 'returnLane', queueLength: 4 }),
        resource({ id: 'wash1', kind: 'wash', queueLength: 6 }),
        resource({ id: 'bay1', kind: 'service', queueLength: 1 }),
        resource({ id: 'charger1', kind: 'charger', queueLength: 3 }),
        resource({ id: 'pump1', kind: 'pump', queueLength: 9 }),
        resource({ id: 'gate1', kind: 'gate', queueLength: 2 }),
        resource({ id: 'sedan-01', kind: 'slot', queueLength: 5 }),
      ],
    );
    expect(queueSummary(snap)).toEqual({ returnLane: 4, wash: 6, service: 1, charger: 3, gate: 2 });
    expect(queueSummary(snapshot())).toEqual({ returnLane: 0, wash: 0, service: 0, charger: 0, gate: 0 });
  });
});

describe('scenarioChips (S-7)', () => {
  it('is empty when nothing is active', () => {
    expect(scenarioChips(idleScenario())).toEqual([]);
  });

  it('lists surge time, offline units and non-normal crews', () => {
    const view = idleScenario({
      active: true,
      surgeRemainingSec: 42 * 60 + 20,
      offline: ['gate2', 'wash1'],
      crews: { inspection: 'normal', wash: 'short', service: 'extra' },
    });
    expect(scenarioChips(view)).toEqual(['Surge 43 min', '2 units offline', 'Wash: short-staffed', 'Service: extra crew']);
    expect(scenarioChips(idleScenario({ active: true, offline: ['pump1'] }))).toEqual(['1 unit offline']);
  });
});

describe('outage helpers (S-2, S-6, S-8)', () => {
  it('groups every outage-able unit by station, with labels', () => {
    const groups = outageGroups();
    expect(groups.map((g) => [g.kind, g.label, g.units.length])).toEqual([
      ['returnLane', 'Return lanes', 4],
      ['wash', 'Wash bays', 2],
      ['service', 'Service bays', 3],
      ['charger', 'EV chargers', 8],
      ['pump', 'Fuel pumps', 4],
      ['gate', 'Exit gates', 2],
    ]);
    expect(groups[1]?.units).toEqual([
      { id: 'wash1', label: 'Wash bay 1' },
      { id: 'wash2', label: 'Wash bay 2' },
    ]);
  });

  it('knows which units can have outages', () => {
    expect(isOutageable('charger5')).toBe(true);
    expect(isOutageable('sedan-01')).toBe(false);
    expect(isOutageable('towbay1')).toBe(false);
  });

  it('explains why the last open unit of a station cannot close', () => {
    expect(offlineReason(idleScenario(), 'wash1')).toBeNull();
    expect(offlineReason(idleScenario({ active: true, offline: ['wash1'] }), 'wash2')).toBe('At least one wash bay must stay open');
    expect(offlineReason(idleScenario({ active: true, offline: ['gate1'] }), 'gate2')).toBe('At least one exit gate must stay open');
    expect(offlineReason(idleScenario({ active: true, offline: ['wash1'] }), 'wash1')).toBeNull();
    expect(offlineReason(idleScenario(), 'sedan-01')).toBeNull();
  });
});
