import { describe, expect, it } from 'vitest';
import { createFlightSchedule, JET_LENGTH } from '../../../src/airport/flights';
import { airportPlan } from '../../../src/airport/plan';
import { BUS_DWELL_SEC, TRAFFIC_COUNT, TRAFFIC_GAP, airportDetail, serviceVehiclesAt, trafficAt } from '../../../src/airport/traffic';
import { hubBounds } from '../../../src/layout/positions';
import { PATROL_MARGIN } from '../../../src/layout/site';

// Requirements F-4, F-5, §11.6; architecture §19 H6, H13.

const plan = airportPlan();
const hub = hubBounds(PATROL_MARGIN + 4);

describe('trafficAt (F-4)', () => {
  it('is deterministic and scales with density', () => {
    expect(trafficAt(12.5, 1)).toEqual(trafficAt(12.5, 1));
    expect(trafficAt(0, 1)).toHaveLength(TRAFFIC_COUNT);
    expect(trafficAt(0, 0.5).length).toBeLessThanOrEqual(Math.ceil(TRAFFIC_COUNT / 2));
    expect(trafficAt(0, 0.5).length).toBeGreaterThanOrEqual(Math.floor(TRAFFIC_COUNT / 2) - 1);
    expect(trafficAt(0, 0)).toEqual([]);
  });

  it('keeps vehicles on one lane at least the traffic gap apart', () => {
    for (let t = 0; t < 120; t += 0.5) {
      const list = trafficAt(t, 1);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          if (a.lane !== b.lane) continue;
          expect(Math.hypot(a.x - b.x, a.z - b.z), `t=${String(t)} ${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(TRAFFIC_GAP * 0.95);
        }
      }
    }
  });

  it('stays off the hub and puts boulevard traffic on the deck', () => {
    for (let t = 0; t < 60; t += 2) {
      for (const v of trafficAt(t, 1)) {
        const inHub = v.x > hub.minX && v.x < hub.maxX && v.z > hub.minZ && v.z < hub.maxZ;
        expect(inHub, `${v.id} at ${v.x.toFixed(0)},${v.z.toFixed(0)}`).toBe(false);
        if (v.lane.startsWith('blvd') && Math.abs(v.x - plan.boulevard.x) < plan.boulevard.width && v.z < plan.boulevard.toZ - 60) expect(v.y).toBeCloseTo(plan.boulevard.deckY, 0);
      }
    }
  });

  it('includes taxis and buses, and buses dwell at the curb', () => {
    const kinds = new Set(trafficAt(0, 1).map((v) => v.kind));
    expect(kinds).toEqual(new Set(['car', 'taxi', 'bus']));
    let dwelt = 0;
    for (let t = 0; t < 200; t += 1) {
      for (const b of trafficAt(t, 1).filter((v) => v.kind === 'bus')) {
        const later = trafficAt(t + BUS_DWELL_SEC / 2, 1).find((v) => v.id === b.id);
        const atCurb = Math.abs(b.z - plan.curb.z) < 12 && b.x > plan.curb.fromX && b.x < plan.curb.toX;
        if (atCurb && later && Math.hypot(later.x - b.x, later.z - b.z) < 0.01) dwelt++;
      }
    }
    expect(dwelt).toBeGreaterThan(0);
  });
});

describe('serviceVehiclesAt (F-5)', () => {
  const s = createFlightSchedule();

  it('puts a tug at the nose of every jet in pushback', () => {
    let checked = 0;
    for (let t = 0; t < 240; t += 0.5) {
      const aircraft = s.aircraftAt(t);
      const tugs = serviceVehiclesAt(t, aircraft).filter((v) => v.kind === 'tug');
      for (const jet of aircraft.filter((a) => a.phase === 'pushback')) {
        const nose = { x: jet.x + Math.cos(jet.heading) * (JET_LENGTH / 2 + 3), z: jet.z + Math.sin(jet.heading) * (JET_LENGTH / 2 + 3) };
        expect(tugs.some((g) => Math.hypot(g.x - nose.x, g.z - nose.z) < 3), `t=${String(t)}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('runs a fuel truck and a follow-me car on the airside, never on the runway', () => {
    for (let t = 0; t < 200; t += 1) {
      const list = serviceVehiclesAt(t, s.aircraftAt(t));
      for (const kind of ['fuel', 'followMe'] as const) {
        const v = list.find((x) => x.kind === kind);
        expect(v, kind).toBeDefined();
        expect(v!.z).toBeGreaterThan(plan.airsideFence.z);
        expect(Math.abs(v!.z - plan.runway.z)).toBeGreaterThan(plan.runway.width / 2 + 5);
      }
    }
  });
});

describe('airportDetail (§11.6, §11.7)', () => {
  it('shows everything on tier 0', () => {
    expect(airportDetail(0, false)).toEqual({ flights: true, traffic: 1, vehicles: true, lightAnim: true });
  });

  it('halves traffic and drops airport vehicles on tier 1', () => {
    expect(airportDetail(1, false)).toEqual({ flights: true, traffic: 0.5, vehicles: false, lightAnim: true });
  });

  it('parks the jets and drops traffic and light animation on tier 2', () => {
    expect(airportDetail(2, false)).toEqual({ flights: false, traffic: 0, vehicles: false, lightAnim: false });
  });

  it('keeps flights but steadies lights with reduced motion', () => {
    expect(airportDetail(0, true)).toEqual({ flights: true, traffic: 1, vehicles: true, lightAnim: false });
  });
});
