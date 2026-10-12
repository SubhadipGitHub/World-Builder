import { describe, expect, it } from 'vitest';
import { detailStates } from '../../../src/render/details';
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

  it('raises a gate barrier for an occupied gate that is not mid-checkout', () => {
    expect([...detailStates(snap).raisedBarriers]).toEqual(['gate1']);
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
