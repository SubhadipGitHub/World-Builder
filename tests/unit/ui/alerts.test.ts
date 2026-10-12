import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../../src/sim/events';
import { createAlertFeed } from '../../../src/ui/alerts';
import { agent, snapshot } from './fixtures';

const flagged = (vehicleId: string, severe: boolean, t: number): SimEvent => ({ type: 'maintenanceFlagged', vehicleId, reason: 'tyres', severe, simTimeSec: t });

describe('createAlertFeed (D-8)', () => {
  it('turns events into alerts with the right severity and wording', () => {
    const f = createAlertFeed();
    f.ingest([
      flagged('GL-PGW-00001', false, 10),
      flagged('GL-PGW-00002', true, 20),
      { type: 'towDispatched', vehicleId: 'GL-PGW-00002', towId: 'tow-1', simTimeSec: 30 },
      { type: 'queueOverflow', resource: 'wash', length: 7, simTimeSec: 40 },
      { type: 'milestone', vehicleId: 'GL-PGW-00001', stage: 'washed', simTimeSec: 50 },
    ]);
    expect(f.list().map((a) => [a.severity, a.message, a.vehicleId])).toEqual([
      ['warning', 'Wash queue at 7 cars', null],
      ['info', 'Tow truck dispatched for GL-PGW-00002', 'GL-PGW-00002'],
      ['critical', 'Severe damage on GL-PGW-00002 — tow requested', 'GL-PGW-00002'],
      ['warning', 'Maintenance: tyres on GL-PGW-00001', 'GL-PGW-00001'],
    ]);
    expect(new Set(f.list().map((a) => a.id)).size).toBe(4);
  });

  it('names every queue station', () => {
    const f = createAlertFeed();
    const stations = ['service', 'charger', 'pump', 'slot', 'gate'];
    f.ingest(stations.map((resource, i) => ({ type: 'queueOverflow', resource, length: 8, simTimeSec: i })));
    expect(f.list().map((a) => a.message).reverse()).toEqual([
      'Service queue at 8 cars',
      'EV charger queue at 8 cars',
      'Fuel pump queue at 8 cars',
      'Ready lot queue at 8 cars',
      'Exit gate queue at 8 cars',
    ]);
  });

  it('counts unread alerts until they are read, and caps the list', () => {
    const f = createAlertFeed(3);
    f.ingest([flagged('a', false, 1), flagged('b', false, 2)]);
    expect(f.unread()).toBe(2);
    f.markAllRead();
    expect(f.unread()).toBe(0);
    f.ingest([flagged('c', false, 3), flagged('d', false, 4)]);
    expect(f.unread()).toBe(2);
    expect(f.list().map((a) => a.vehicleId)).toEqual(['d', 'c', 'b']);
  });

  it('warns once per stay when an EV is staged below the SoC threshold', () => {
    const f = createAlertFeed();
    const low = agent({ id: 'GL-PGW-00007', state: 'staged', socPct: 72.4 });
    f.observeSnapshot(snapshot([low]), 80);
    f.observeSnapshot(snapshot([low]), 80);
    expect(f.list().map((a) => a.message)).toEqual(['GL-PGW-00007 staged at 72% charge']);
    f.observeSnapshot(snapshot([{ ...low, state: 'departing' }]), 80);
    f.observeSnapshot(snapshot([low]), 80);
    expect(f.list()).toHaveLength(2);
    f.observeSnapshot(snapshot([agent({ id: 'ok', state: 'staged', socPct: 90 }), agent({ id: 'ice', cls: 'sedan', state: 'staged', socPct: null, fuelPct: 20 })]), 80);
    expect(f.list()).toHaveLength(2);
  });
});

describe('createAlertFeed: scenario alerts (S-9)', () => {
  it('logs lever changes as info alerts, with the unit to select', () => {
    const f = createAlertFeed();
    f.ingest([
      { type: 'scenario', change: 'surgeStarted', simTimeSec: 1 },
      { type: 'scenario', change: 'unitOffline', unitId: 'wash1', simTimeSec: 2 },
      { type: 'scenario', change: 'crewChanged', station: 'wash', level: 'short', simTimeSec: 3 },
      { type: 'scenario', change: 'crewChanged', station: 'service', level: 'extra', simTimeSec: 4 },
      { type: 'scenario', change: 'crewChanged', station: 'inspection', level: 'normal', simTimeSec: 5 },
      { type: 'scenario', change: 'rejected', unitId: 'wash2', simTimeSec: 6 },
      { type: 'scenario', change: 'unitOnline', unitId: 'gate2', simTimeSec: 7 },
      { type: 'scenario', change: 'surgeEnded', simTimeSec: 8 },
      { type: 'scenario', change: 'reset', simTimeSec: 9 },
    ]);
    expect(f.list().map((a) => [a.severity, a.message, a.unitId, a.vehicleId])).toEqual([
      ['info', 'Scenario reset to normal', null, null],
      ['info', 'Surge ended', null, null],
      ['info', 'Exit gate 2 back online', 'gate2', null],
      ['info', 'Inspection crew: normal', null, null],
      ['info', 'Service crew: extra crew', null, null],
      ['info', 'Wash crew: short-staffed', null, null],
      ['info', 'Wash bay 1 taken offline', 'wash1', null],
      ['info', 'Surge: flight bank landed', null, null],
    ]);
  });

  it('keeps unitId null on ordinary alerts', () => {
    const f = createAlertFeed();
    f.ingest([flagged('GL-PGW-00001', false, 10)]);
    expect(f.list()[0]?.unitId).toBeNull();
  });
});
