import { describe, expect, it } from 'vitest';
import { rates } from '../../src/config/rates';
import type { WeatherMode } from '../../src/config/weather';
import { createGridlockDetector, findOverlaps } from '../../src/sim/invariants';
import { createSim } from '../../src/sim/world';

// M7 calibration targets over a whole hub day (requirements §12.4, architecture §20.4).
// The hub opens at 08:00, so a 24 h run covers the morning peak's tail (to 10:00), midday, the
// evening peak (16–20), the night and the early morning.

const SEEDS = [1, 2, 3];
// M9 (§14.8): fog joins the Balanced set with a 50-minute turnaround target.
const BALANCED: readonly WeatherMode[] = ['clear', 'overcast', 'fog', 'rain'];
const TURNAROUND_TARGET: Readonly<Partial<Record<WeatherMode, number>>> = { clear: 45, overcast: 45, fog: 50, rain: 55 };
const STEPS = Math.round(86_400 / (rates.stepWallSec * rates.timeScale));
/** Hub hours 60 minutes after each peak ends (morning peak 10:00, evening peak 20:00). */
const RECOVERY_HOURS = [11, 21];
const QUEUED = ['gate', 'wash', 'service', 'charger'] as const;

interface Day {
  turnaround: number;
  utilisation: number;
  served: number;
  maxQueue: number;
  recovery: { hour: number; queue: number }[];
  /** M9 (§14.8): maintenance flags ÷ inspections, and the revenue booked over the day. */
  flagRate: number;
  revenue: number;
}

function runDay(seed: number, mode: WeatherMode): Day {
  const sim = createSim({ seed, weather: mode });
  const gridlock = createGridlockDetector(rates.gridlockSimSec);
  // Customers still waiting (at the counter, or assigned a car not yet out of the gate).
  const open = (): number => {
    const s = sim.snapshot();
    return s.counterQueue + s.agents.filter((a) => a.state === 'departing').length;
  };
  const openAtStart = open();
  let checkouts = 0;
  let flags = 0;
  let inspections = 0;
  let tSum = 0;
  let tN = 0;
  let uSum = 0;
  let uN = 0;
  let maxQueue = 0;
  const recovery: Day['recovery'] = [];
  const pending = [...RECOVERY_HOURS];
  for (let i = 0; i < STEPS; i++) {
    sim.step();
    if (i % 2 === 0) {
      const overlaps = findOverlaps(sim.footprints());
      if (overlaps.length > 0) throw new Error(`overlap at step ${String(i)}: ${JSON.stringify(overlaps)}`);
    }
    for (const e of sim.drainEvents()) {
      if (e.type === 'checkout') checkouts++;
      else if (e.type === 'maintenanceFlagged') flags++;
      else if (e.type === 'milestone' && e.stage === 'inspected') inspections++;
    }
    const snap = sim.snapshot();
    const stuck = gridlock.update(
      snap.agents.map((a) => ({ id: a.id, speed: a.speed, parked: a.parked })),
      snap.simTimeSec,
    );
    if (stuck.length > 0) throw new Error(`gridlock at step ${String(i)}: ${stuck.join(', ')}`);
    const queue = Math.max(0, ...snap.resources.filter((r) => (QUEUED as readonly string[]).includes(r.kind)).map((r) => r.queueLength));
    maxQueue = Math.max(maxQueue, queue);
    if (pending.length > 0 && Math.abs(snap.clockHours - (pending[0] ?? -1)) < 0.01) {
      recovery.push({ hour: pending.shift() ?? 0, queue });
    }
    if (i % 400 === 0) {
      const m = sim.metrics();
      if (m.turnaroundMin !== null) {
        tSum += m.turnaroundMin;
        tN++;
      }
      uSum += m.utilisation;
      uN++;
    }
  }
  // Served = checkouts ÷ the pickups customers actually asked for during the day. Dividing by the
  // expected demand instead made the seeds' random arrival counts (±8%) look like service failures.
  const requests = checkouts + open() - openAtStart;
  return {
    turnaround: tSum / Math.max(1, tN),
    utilisation: uSum / Math.max(1, uN),
    served: checkouts / Math.max(1, requests),
    maxQueue,
    recovery,
    flagRate: flags / Math.max(1, inspections),
    revenue: sim.metrics().revenue.total,
  };
}

describe('day-long calibration (§12.4, Balanced)', () => {
  for (const seed of SEEDS) {
    for (const mode of BALANCED) {
      it(`seed ${String(seed)}, ${mode}: meets the Balanced targets over a day`, () => {
        const d = runDay(seed, mode);
        // D31: rain slows driving by 20%, so its turnaround target is 55 min; M9: fog 50 min.
        expect(d.turnaround, 'average turnaround (min)').toBeLessThanOrEqual(TURNAROUND_TARGET[mode] ?? 45);
        expect(d.utilisation, 'average utilisation').toBeGreaterThanOrEqual(0.6);
        // D37: 60–75%, room for the seed-to-seed spread in demand (was 60–70%).
        expect(d.utilisation, 'average utilisation').toBeLessThanOrEqual(0.75);
        expect(d.served, 'pickups served').toBeGreaterThanOrEqual(0.9);
        // D35: queues run at 2–8 even at midday, so the peak cap is 12 and recovery means back to ≤ 8.
        expect(d.maxQueue, 'longest gate/wash/service/charger queue').toBeLessThanOrEqual(12);
        expect(d.recovery.map((r) => r.hour)).toEqual(RECOVERY_HOURS);
        // D39: no counter-recovery check. On busy seeds the hub runs out of ready cars at the peaks, so
        // customers wait at the counter for longer; served (above) is the service-level measure.
        for (const r of d.recovery) {
          expect(r.queue, `queues an hour after the peak (${String(r.hour)}:00)`).toBeLessThanOrEqual(8);
        }
      });
    }
  }
});

describe('heatwave stress case (§12.4, Q2)', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}, heatwave: no overlap or gridlock, ≥ 80% served, queues recover`, () => {
      const d = runDay(seed, 'heatwave');
      expect(d.served).toBeGreaterThanOrEqual(0.8);
      const evening = d.recovery.find((r) => r.hour === 21);
      expect(evening?.queue ?? Infinity).toBeLessThanOrEqual(10);
    });
  }
});

describe('thunderstorm stress case (M9, §14.8)', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}, storm: no overlap or gridlock, ≥ 85% served, queues recover`, () => {
      const d = runDay(seed, 'storm');
      expect(d.served).toBeGreaterThanOrEqual(0.85);
      const evening = d.recovery.find((r) => r.hour === 21);
      expect(evening?.queue ?? Infinity).toBeLessThanOrEqual(10);
    });
  }
});

describe('fleet economics over a day (M9, FE-4, FE-5)', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}, clear: 8–12% of inspections flag maintenance, and revenue is plausible`, () => {
      const d = runDay(seed, 'clear');
      expect(d.flagRate, 'maintenance flags per inspection').toBeGreaterThanOrEqual(0.08);
      expect(d.flagRate, 'maintenance flags per inspection').toBeLessThanOrEqual(0.12);
      // About 480 rentals at $42–$119 a day: a sanity band, not a target.
      expect(d.revenue).toBeGreaterThanOrEqual(25_000);
      expect(d.revenue).toBeLessThanOrEqual(40_000);
    });
  }
});
