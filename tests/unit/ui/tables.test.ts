import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../../src/sim/events';
import { createCheckoutLog, fleetRows, queueRows } from '../../../src/ui/tables';
import { agent, resource, snapshot } from './fixtures';

describe('fleetRows (D-6 Active fleet)', () => {
  it('lists fleet cars by id with model, status, energy and location', () => {
    const rows = fleetRows(
      snapshot([
        agent({ id: 'GL-PGW-00002', cls: 'sedan', socPct: null, fuelPct: 37, state: 'toLot' }),
        agent({ id: 'shuttle-1', kind: 'shuttle', cls: null }),
        agent({ id: 'GL-PGW-00001' }),
        agent({ id: 'GL-PGW-00003', x: -200, z: -70 }),
      ]),
    );
    expect(rows).toEqual([
      { id: 'GL-PGW-00001', model: 'Compact EV crossover', status: 'Washing', energy: 'Battery 64%', location: 'EV charging & fuel' },
      { id: 'GL-PGW-00002', model: 'Mid-size sedan', status: 'Heading to Ready lot', energy: 'Fuel 37%', location: 'EV charging & fuel' },
      { id: 'GL-PGW-00003', model: 'Compact EV crossover', status: 'Washing', energy: 'Battery 64%', location: 'On hub roads' },
    ]);
  });
});

describe('queueRows (D-6 Turnaround & service queue)', () => {
  it('lists occupied service units with the service and time remaining', () => {
    const rows = queueRows(
      snapshot(
        [agent({ id: 'A', etaSimSec: 190 }), agent({ id: 'B', etaSimSec: null }), agent({ id: 'C' })],
        [
          resource({ id: 'lane1', kind: 'returnLane', occupantId: 'B' }),
          resource({ id: 'wash2', kind: 'wash', occupantId: 'A' }),
          resource({ id: 'bay1', kind: 'service', occupantId: null }),
          resource({ id: 'charger3', kind: 'charger', occupantId: 'C' }),
          resource({ id: 'sedan-01', kind: 'slot', occupantId: 'C' }),
          resource({ id: 'gate1', kind: 'gate', occupantId: 'C' }),
        ],
      ),
    );
    expect(rows).toEqual([
      { unitId: 'lane1', bay: 'Return lane 1', vehicleId: 'B', service: 'Inspection', remaining: '—' },
      { unitId: 'wash2', bay: 'Wash bay 2', vehicleId: 'A', service: 'Wash', remaining: '3 min' },
      { unitId: 'charger3', bay: 'EV charger 3', vehicleId: 'C', service: 'Charging', remaining: '3 min' },
    ]);
  });

  it('labels service and pump units', () => {
    const rows = queueRows(
      snapshot([agent({ id: 'A' })], [resource({ id: 'bay2', kind: 'service', occupantId: 'A' }), resource({ id: 'pump1', kind: 'pump', occupantId: 'A' })]),
    );
    expect(rows.map((r) => r.service)).toEqual(['Service', 'Refuelling']);
  });
});

describe('createCheckoutLog (D-6 Customer checkout log)', () => {
  const checkout = (n: number): SimEvent => ({
    type: 'checkout',
    vehicleId: `GL-PGW-0000${String(n)}`,
    agreementNo: `RA-26-000000${String(n)}`,
    tier: n % 2 ? 'Gold' : 'Platinum',
    gateId: 'gate1',
    simTimeSec: n * 10,
  });

  it('keeps checkouts newest first, capped', () => {
    const log = createCheckoutLog(2);
    log.ingest([checkout(1), { type: 'towDispatched', vehicleId: 'x', towId: 't', simTimeSec: 0 }, checkout(2)]);
    log.ingest([checkout(3)]);
    expect(log.rows()).toEqual([
      { agreementNo: 'RA-26-0000003', vehicleId: 'GL-PGW-00003', tier: 'Gold', gate: 'Exit gate 1', simTimeSec: 30 },
      { agreementNo: 'RA-26-0000002', vehicleId: 'GL-PGW-00002', tier: 'Platinum', gate: 'Exit gate 1', simTimeSec: 20 },
    ]);
  });
});
