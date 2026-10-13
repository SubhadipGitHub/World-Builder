import { describe, expect, it } from 'vitest';
import {
  CYCLE_SEC,
  MAX_INTERVAL,
  MIN_INTERVAL,
  hubHoursAt,
  movementInterval,
  GEAR_DOWN_BELOW,
  GLIDE_DEG,
  INITIAL_GATES,
  JET_SPAN,
  MAX_ROLL_SPEED,
  MAX_TAXI_SPEED,
  OUT_OF_VIEW,
  TOUCHDOWN_X,
  createFlightSchedule,
  type AircraftPose,
  type FlightSchedule,
} from '../../../src/airport/flights';
import { airportPlan } from '../../../src/airport/plan';

// Requirements F-1…F-3, architecture §19 H3–H5.

const plan = airportPlan();
const CYCLES = 10;
const DT = 0.25;
const onRunway = (a: AircraftPose): boolean =>
  a.y < 2 && Math.abs(a.z - plan.runway.z) <= plan.runway.width / 2 && a.x >= plan.runway.fromX - 5 && a.x <= plan.runway.toX + 5;

/** Samples the schedule over [from, to) every DT seconds. */
function sample(s: FlightSchedule, from: number, to: number, each: (t: number, list: readonly AircraftPose[]) => void): void {
  for (let t = from; t < to; t += DT) each(t, s.aircraftAt(t));
}

describe('flight schedule: cadence and determinism (F-1, D23, R-5)', () => {
  it('is deterministic', () => {
    const a = createFlightSchedule();
    const b = createFlightSchedule();
    for (const t of [0, 13.5, 47, 333.25]) expect(a.aircraftAt(t)).toEqual(b.aircraftAt(t));
  });

  it('starts with the initial gates occupied by parked jets', () => {
    const s = createFlightSchedule();
    const gates = s.gatesAt(0);
    for (const g of INITIAL_GATES) expect(gates.get(g), g).not.toBeNull();
    const parked = s.aircraftAt(0).filter((a) => a.phase === 'parked');
    expect(parked.length).toBeGreaterThanOrEqual(INITIAL_GATES.length);
  });

  it('alternates a landing and a take-off about every 40 s', () => {
    const s = createFlightSchedule();
    const touchdowns: number[] = [];
    const liftoffs: number[] = [];
    let prev = new Map<string, AircraftPose>();
    sample(s, 0, CYCLES * CYCLE_SEC, (t, list) => {
      const now = new Map(list.map((a) => [a.id, a]));
      for (const a of list) {
        const p = prev.get(a.id);
        // The approach → landing change (M7: touchdowns no longer fall on the 0.25 s sample grid).
        if (p && p.phase === 'approach' && a.phase === 'landing') touchdowns.push(t);
        if (p && p.y <= 0.5 && a.y > 0.5 && (a.phase === 'takeoff' || a.phase === 'climb')) liftoffs.push(t);
      }
      prev = now;
    });
    expect(touchdowns.length).toBeGreaterThanOrEqual(CYCLES - 1);
    expect(liftoffs.length).toBeGreaterThanOrEqual(CYCLES - 1);
    // M7 (K8): each cycle lasts two movement intervals at the hub hour of its touchdown.
    touchdowns.slice(1).forEach((t, i) => {
      const prev = touchdowns[i] ?? 0;
      expect(t - prev).toBeCloseTo(2 * movementInterval(hubHoursAt(prev)), 0);
    });
    // Take-offs fall between landings.
    for (const t of liftoffs.slice(1, -1)) {
      const before = touchdowns.filter((x) => x < t).pop() ?? -Infinity;
      expect(t - before).toBeGreaterThan(10);
      expect(t - before).toBeLessThan(2 * movementInterval(hubHoursAt(before)));
    }
  });
});

describe('flight schedule: safety (F-1)', () => {
  const s = createFlightSchedule();

  it('never puts two aircraft on the runway at once', () => {
    sample(s, 0, CYCLES * CYCLE_SEC, (t, list) => {
      expect(list.filter(onRunway).length, `t=${String(t)}`).toBeLessThanOrEqual(1);
    });
  });

  it('keeps every two aircraft at least a wingspan plus margin apart', () => {
    sample(s, 0, CYCLES * CYCLE_SEC, (t, list) => {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          expect(d, `t=${String(t)} ${a.id} (${a.phase}) vs ${b.id} (${b.phase})`).toBeGreaterThanOrEqual(Math.max(45, JET_SPAN + 6));
        }
      }
    });
  });

  it('keeps gate use consistent: one jet per gate, 6–7 occupied', () => {
    sample(s, 0, CYCLES * CYCLE_SEC, (t, list) => {
      const gates = s.gatesAt(t);
      const held = [...gates.values()].filter((v) => v !== null);
      expect(new Set(held).size, `t=${String(t)}`).toBe(held.length);
      expect(held.length).toBeGreaterThanOrEqual(6);
      expect(held.length).toBeLessThanOrEqual(7);
      for (const a of list.filter((x) => x.phase === 'parked' && x.gate !== 'remote' && x.gate !== null)) {
        expect(gates.get(a.gate as never), `${a.id} parked at ${String(a.gate)}`).toBe(a.id);
      }
    });
  });

  it('docks each arrival at a gate that was free, and frees the gate of each departure', () => {
    const arrived = new Map<string, string>();
    sample(s, 0, CYCLES * CYCLE_SEC, (t, list) => {
      for (const a of list) {
        if (a.phase === 'taxiIn' && a.gate && a.gate !== 'remote' && !arrived.has(a.id)) {
          arrived.set(a.id, a.gate);
          const holder = s.gatesAt(t).get(a.gate);
          expect(holder === null || holder === a.id, `${a.gate} free for ${a.id} at t=${String(t)}`).toBe(true);
        }
        if (a.phase === 'taxiOut' && a.gate && a.gate !== 'remote') {
          expect(s.gatesAt(t).get(a.gate), `${a.gate} freed by ${a.id}`).not.toBe(a.id);
        }
      }
    });
    expect(arrived.size).toBeGreaterThanOrEqual(CYCLES - 1);
  });
});

describe('flight schedule: realism (F-1, F-3)', () => {
  const s = createFlightSchedule();

  it('flies a 3° glide path on approach and keeps the gear down below 60 m', () => {
    let checked = 0;
    sample(s, 0, 4 * CYCLE_SEC, (_t, list) => {
      for (const a of list) {
        if (a.phase === 'approach' && a.x > TOUCHDOWN_X + 200 && a.y > 15) {
          const ideal = Math.tan((GLIDE_DEG * Math.PI) / 180) * (a.x - TOUCHDOWN_X);
          expect(Math.abs(a.y - ideal) / ideal).toBeLessThanOrEqual(0.1);
          checked++;
        }
        if (a.y <= GEAR_DOWN_BELOW && a.phase !== 'climb') expect(a.gear, `${a.id} ${a.phase} at ${a.y.toFixed(0)} m`).toBe(1);
        if (a.phase === 'parked' || a.phase === 'taxiIn' || a.phase === 'taxiOut') expect(a.y).toBe(0);
      }
    });
    expect(checked).toBeGreaterThan(10);
  });

  it('keeps ground speeds realistic and poses continuous', () => {
    let prev = new Map<string, AircraftPose>();
    sample(s, 0, 4 * CYCLE_SEC, (t, list) => {
      for (const a of list) {
        if (a.phase === 'taxiIn' || a.phase === 'taxiOut' || a.phase === 'pushback') expect(a.speed, `${a.id} ${a.phase}`).toBeLessThanOrEqual(MAX_TAXI_SPEED + 1e-6);
        if (a.phase === 'landing' || a.phase === 'takeoff') expect(a.speed).toBeLessThanOrEqual(MAX_ROLL_SPEED + 1e-6);
        const p = prev.get(a.id);
        if (p) expect(Math.hypot(a.x - p.x, a.z - p.z), `${a.id} jump at t=${String(t)}`).toBeLessThanOrEqual(130 * DT);
      }
      prev = new Map(list.map((a) => [a.id, a]));
    });
  });

  it('climbs departures out of view to the west and removes them', () => {
    const seen = new Set<string>();
    const gone = new Set<string>();
    let last = new Set<string>();
    sample(s, 0, 4 * CYCLE_SEC, (_t, list) => {
      const ids = new Set(list.map((a) => a.id));
      for (const a of list) if (a.phase === 'climb') {
        seen.add(a.id);
        expect(a.heading).toBeCloseTo(Math.PI, 0);
        expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(OUT_OF_VIEW + 200);
      }
      for (const id of last) if (!ids.has(id) && seen.has(id)) gone.add(id);
      last = ids;
    });
    expect(gone.size).toBeGreaterThanOrEqual(2);
  });

  it('uses all three fictional airlines, and lights landing lights near the runway', () => {
    const airlines = new Set<string>();
    let lit = 0;
    sample(s, 0, CYCLES * CYCLE_SEC, (_t, list) => {
      for (const a of list) {
        airlines.add(a.airline);
        if ((a.phase === 'approach' && a.y < 150) || a.phase === 'landing' || a.phase === 'takeoff') {
          expect(a.landingLights).toBe(true);
          lit++;
        }
      }
    });
    expect([...airlines].sort()).toEqual(['coastline', 'pacificGateway', 'sunlineCargo']);
    expect(lit).toBeGreaterThan(0);
  });
});

describe('flight schedule: extra arrival for a surge (F-2, H5)', () => {
  it('starts the approach within 5 s and keeps every safety rule', () => {
    const s = createFlightSchedule();
    const start = s.scheduleExtra(100);
    expect(start).toBeGreaterThanOrEqual(100);
    expect(start).toBeLessThanOrEqual(105);
    const extra = s.aircraftAt(start + 1).filter((a) => a.phase === 'approach');
    expect(extra.length).toBeGreaterThanOrEqual(1);
    sample(s, 90, 100 + 3 * CYCLE_SEC, (t, list) => {
      expect(list.filter(onRunway).length, `t=${String(t)}`).toBeLessThanOrEqual(1);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), `t=${String(t)} ${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(Math.max(45, JET_SPAN + 6));
        }
      }
    });
  });

  it('parks at the remote stand when every gate is full', () => {
    const s = createFlightSchedule();
    s.scheduleExtra(10);
    s.scheduleExtra(12);
    s.scheduleExtra(14);
    let remote = false;
    sample(s, 10, 10 + 4 * CYCLE_SEC, (t, list) => {
      const held = [...s.gatesAt(t).values()].filter((v) => v !== null);
      expect(new Set(held).size).toBe(held.length);
      expect(held.length).toBeLessThanOrEqual(8);
      if (list.some((a) => a.gate === 'remote' && a.phase === 'parked')) remote = true;
    });
    expect(remote).toBe(true);
  });
});

describe('flight cadence follows the day curve (R-5, K8)', () => {
  it('maps airport time to hub hours from 08:00 at 15 hub seconds per airport second', () => {
    expect(hubHoursAt(0)).toBe(8);
    expect(hubHoursAt(240)).toBeCloseTo(9, 9);
    expect(hubHoursAt(96 * 60)).toBeCloseTo(8, 9);
  });

  it('is about 25 s at the evening peak, 40 s at midday and up to 120 s overnight', () => {
    expect(movementInterval(18)).toBe(MIN_INTERVAL);
    expect([25, 30]).toContain(MIN_INTERVAL);
    expect(movementInterval(13)).toBeGreaterThan(36);
    expect(movementInterval(13)).toBeLessThan(44);
    expect(movementInterval(2.5)).toBe(MAX_INTERVAL);
    for (let h = 0; h < 24; h += 0.25) {
      expect(movementInterval(h)).toBeGreaterThanOrEqual(MIN_INTERVAL);
      expect(movementInterval(h)).toBeLessThanOrEqual(MAX_INTERVAL);
    }
  });

  it('keeps one runway occupant, separation and consistent gates over a whole hub day', () => {
    const s = createFlightSchedule();
    s.scheduleExtra(40); // a surge during the morning peak
    s.scheduleExtra(2_400); // and one at the evening peak
    const DAY = 96 * 60;
    for (let t = 0; t < DAY; t += 0.5) {
      const list = s.aircraftAt(t);
      expect(list.filter(onRunway).length, `t=${String(t)}`).toBeLessThanOrEqual(1);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), `t=${String(t)} ${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(Math.max(45, JET_SPAN + 6));
        }
      }
      const held = [...s.gatesAt(t).values()].filter((v) => v !== null);
      expect(new Set(held).size).toBe(held.length);
    }
  }, 300_000);

  it('flies more often at the peaks than overnight', () => {
    const s = createFlightSchedule();
    const count = (fromHour: number, hours: number): number => {
      const t0 = ((fromHour - 8 + 24) % 24) * 240;
      let n = 0;
      let prev = new Set<string>();
      for (let t = t0; t < t0 + hours * 240; t += 1) {
        const touching = new Set(s.aircraftAt(t).filter((a) => a.phase === 'landing').map((a) => a.id));
        for (const id of touching) if (!prev.has(id)) n++;
        prev = touching;
      }
      return n;
    };
    expect(count(16, 4)).toBeGreaterThan(2 * count(0, 4));
  }, 300_000);
});


describe('next touchdown (M8 SH-9, architecture §21)', () => {
  it('counts down to the next approach → landing change, also after a surge extra', () => {
    const s = createFlightSchedule();
    s.scheduleExtra(300);
    const touchdowns: number[] = [];
    let prev = new Map<string, AircraftPose>();
    sample(s, 0, 900, (t, list) => {
      for (const a of list) {
        const p = prev.get(a.id);
        if (p && p.phase === 'approach' && a.phase === 'landing') touchdowns.push(t);
      }
      prev = new Map(list.map((a) => [a.id, a]));
    });
    expect(touchdowns.length).toBeGreaterThan(5);
    for (const t of [0, 17.25, 123.5, 301, 455.75, 640]) {
      const next = touchdowns.find((x) => x > t);
      if (next === undefined) continue;
      // Sampled touchdowns are seen up to one sample late.
      const got = s.nextTouchdown(t);
      expect(got).not.toBeNull();
      expect(next - t - (got ?? 0)).toBeGreaterThanOrEqual(-1e-6);
      expect(next - t - (got ?? 0)).toBeLessThanOrEqual(DT + 1e-6);
    }
  });
});
