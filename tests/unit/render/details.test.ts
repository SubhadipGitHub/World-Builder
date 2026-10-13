import { describe, expect, it } from 'vitest';
import { unitStop } from '../../../src/layout/positions';
import { BARRIER_CLEAR_M, BARRIER_LIFT_AT, GATE_ARM_AHEAD_M, detailStates } from '../../../src/render/details';
import { agent, resource, snapshot } from '../ui/fixtures';

describe('detailStates (V-9, P9)', () => {
  const snap = snapshot(
    [agent({ id: 'A' }), agent({ id: 'B', parentId: null })],
    [
      resource({ id: 'wash1', kind: 'wash', occupantId: 'A', progress: 0.4 }),
      resource({ id: 'wash2', kind: 'wash', occupantId: 'B', progress: null }),
      resource({ id: 'bay1', kind: 'service', occupantId: 'A', progress: 0.2 }),
      resource({ id: 'bay2', kind: 'service', occupantId: null }),
      resource({ id: 'gate1', kind: 'gate', occupantId: 'A', progress: null }),
      resource({ id: 'gate2', kind: 'gate', occupantId: 'B', progress: 0.5 }),
      resource({ id: 'charger1', kind: 'charger', occupantId: 'A', progress: 0.3 }),
      resource({ id: 'charger2', kind: 'charger', occupantId: 'B', progress: null }),
      resource({ id: 'charger3', kind: 'charger', occupantId: null }),
    ],
  );

  it('spins wash brushes only mid-cycle', () => {
    expect([...detailStates(snap).spinningWash]).toEqual(['wash1']);
  });

  it('opens garage doors for occupied service bays', () => {
    expect([...detailStates(snap).openDoors]).toEqual(['bay1']);
  });

  it('keeps gate barriers down for a car still driving up to the gate, or early in checkout', () => {
    expect([...detailStates(snap).raisedBarriers]).toEqual([]);
  });

  it('reports every charger as charging or idle', () => {
    expect(Object.fromEntries(detailStates(snap).chargers)).toEqual({ charger1: 'charging', charger2: 'idle', charger3: 'idle' });
  });

  it('flashes the tow beacon only while a car is being towed', () => {
    expect(detailStates(snap).towBeacon).toBe(false);
    const towing = snapshot([agent({ id: 'T', kind: 'tow', cls: null }), agent({ id: 'C', parentId: 'T' })]);
    expect(detailStates(towing).towBeacon).toBe(true);
  });
});

describe('detailStates: exit-gate barriers (V-9)', () => {
  // Gate lanes run west; a car's x, z is its body centre.
  const stop = unitStop('gate1');
  const L = 4.75;
  /** A car in gate1's lane with its centre `along` metres past the stop line. */
  const car = (id: string, along: number, lateral = 0) =>
    agent({
      id,
      length: L,
      heading: stop.heading,
      x: stop.x + Math.cos(stop.heading) * along - Math.sin(stop.heading) * lateral,
      z: stop.z + Math.sin(stop.heading) * along + Math.cos(stop.heading) * lateral,
    });
  const atLine = -L / 2;
  const raised = (agents: ReturnType<typeof agent>[], gate1: Partial<ReturnType<typeof resource>>) =>
    [...detailStates(snapshot(agents, [resource({ id: 'gate1', kind: 'gate', ...gate1 }), resource({ id: 'gate2', kind: 'gate' })])).raisedBarriers];

  it('stays down while a car drives up to the gate', () => {
    expect(raised([car('A', atLine - 8)], { occupantId: 'A', progress: null })).toEqual([]);
  });

  it('stays down while the car waits at the line during checkout', () => {
    expect(raised([car('A', atLine)], { occupantId: 'A', progress: 0.3 })).toEqual([]);
  });

  it('lifts near the end of checkout, before the car pulls away', () => {
    expect(raised([car('A', atLine)], { occupantId: 'A', progress: BARRIER_LIFT_AT })).toEqual(['gate1']);
  });

  it('stays up once checkout is done and the car is still at the line', () => {
    expect(raised([car('A', atLine)], { occupantId: 'A', progress: null })).toEqual(['gate1']);
  });

  it('stays up while the departing car passes under the arm, after the gate is released', () => {
    for (const along of [0, GATE_ARM_AHEAD_M, GATE_ARM_AHEAD_M + L / 2]) {
      expect(raised([car('A', along)], { occupantId: null })).toEqual(['gate1']);
    }
  });

  it('lowers once the departing car’s rear has cleared the arm', () => {
    expect(raised([car('A', GATE_ARM_AHEAD_M + BARRIER_CLEAR_M + L / 2 + 0.1)], { occupantId: null })).toEqual([]);
  });

  it('ignores cars in the other gate lane and pedestrians', () => {
    expect(raised([car('A', 1, 6)], { occupantId: null })).toEqual([]);
    expect(raised([{ ...car('P', 1), kind: 'pedestrian' }], { occupantId: null })).toEqual([]);
  });
});

describe('detailStates: outages (S-2)', () => {
  it('lists offline units for hazard cones', () => {
    const snap = snapshot(
      [],
      [resource({ id: 'wash1', kind: 'wash', online: false }), resource({ id: 'wash2', kind: 'wash' }), resource({ id: 'gate2', kind: 'gate', online: false })],
    );
    expect([...detailStates(snap).offlineUnits]).toEqual(['wash1', 'gate2']);
    expect(detailStates(snapshot()).offlineUnits.size).toBe(0);
  });
});
