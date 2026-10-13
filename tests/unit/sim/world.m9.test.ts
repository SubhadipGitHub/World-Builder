import { describe, expect, it } from 'vitest';
import { FLEET_CLASSES, rowOf } from '../../../src/config/fleet';
import type { SimEvent } from '../../../src/sim/events';
import type { VehicleClass } from '../../../src/sim/types';
import { createSim, type Sim } from '../../../src/sim/world';

// M9 simulation (FE-1…FE-7; architecture F3–F10).

const steps = (sim: Sim, n: number, each?: (i: number) => void): void => {
  for (let i = 0; i < n; i++) {
    sim.step();
    each?.(i);
  }
};
const fleetOnMap = (sim: Sim) => sim.snapshot().agents.filter((a) => a.kind === 'fleet');
const RATES = new Set(Object.values(FLEET_CLASSES).map((c) => c.ratePerDay));

describe('fleet of 7 classes (FE-1, FE-2)', () => {
  it('brings every class onto the map over an hour or so', () => {
    const sim = createSim({ seed: 'm9-classes' });
    const seen = new Set<VehicleClass>();
    steps(sim, 6_000, (i) => {
      if (i % 50 === 0) for (const a of fleetOnMap(sim)) if (a.cls) seen.add(a.cls);
    });
    expect([...seen].sort()).toEqual(['economy', 'ev', 'luxury', 'minivan', 'pickup', 'sedan', 'suv']);
  });

  it('gives every fleet car its rate and service countdown, and none to other agents (FE-9)', () => {
    const sim = createSim({ seed: 'm9-views' });
    steps(sim, 600);
    const agents = sim.snapshot().agents;
    const fleet = agents.filter((a) => a.kind === 'fleet');
    expect(fleet.length).toBeGreaterThan(0);
    for (const a of fleet) {
      expect(RATES.has(a.ratePerDay ?? -1)).toBe(true);
      expect(a.milesToService).not.toBeNull();
      expect(a.milesToService!).toBeGreaterThanOrEqual(0);
      expect(a.milesToService!).toBeLessThanOrEqual(FLEET_CLASSES[a.cls!].serviceIntervalMi);
    }
    for (const a of agents.filter((x) => x.kind !== 'fleet')) {
      expect(a.ratePerDay).toBeNull();
      expect(a.milesToService).toBeNull();
    }
  });
});

describe('ready lot by row (FE-3, D51)', () => {
  it('names the 48 stalls by row: 18 cars, 12 SUVs & vans, 18 EV', () => {
    const slots = createSim({ seed: 1 }).snapshot().resources.filter((r) => r.kind === 'slot');
    const byRow = (p: string) => slots.filter((s) => s.id.startsWith(`${p}-`)).length;
    expect(slots.every((s) => /^(cars|large|ev)-\d{2}$/.test(s.id))).toBe(true);
    expect([byRow('cars'), byRow('large'), byRow('ev')]).toEqual([18, 12, 18]);
  });

  it('stages nearly every car in its own row (the 120 s fallback aside)', () => {
    const sim = createSim({ seed: 'm9-rows' });
    let own = 0;
    let total = 0;
    steps(sim, 4_800, (i) => {
      if (i % 200 !== 0) return;
      const snap = sim.snapshot();
      const cls = new Map(snap.agents.map((a) => [a.id, a.cls]));
      for (const r of snap.resources) {
        if (r.kind !== 'slot' || !r.occupantId) continue;
        const c = cls.get(r.occupantId);
        if (!c) continue;
        total++;
        if (r.id.startsWith(`${rowOf(c)}-`)) own++;
      }
    });
    expect(total).toBeGreaterThan(50);
    expect(own / total).toBeGreaterThan(0.9);
  });
});

describe('mileage-based maintenance (FE-4, F5)', () => {
  it('flags cars for scheduled service when due, never as severe', () => {
    const sim = createSim({ seed: 'm9-service', rateOverrides: { maintenanceChance: 0 } });
    const flags: Extract<SimEvent, { type: 'maintenanceFlagged' }>[] = [];
    steps(sim, 16_000, () => {
      for (const e of sim.drainEvents()) if (e.type === 'maintenanceFlagged') flags.push(e);
    });
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) {
      expect(f.reason).toBe('interval');
      expect(f.severe).toBe(false);
    }
  });

  it('resets the service countdown to the full interval after service', () => {
    const sim = createSim({ seed: 'm9-service', rateOverrides: { maintenanceChance: 0 } });
    const flagged = new Set<string>();
    const checked = new Set<string>();
    steps(sim, 16_000, () => {
      for (const e of sim.drainEvents()) if (e.type === 'maintenanceFlagged') flagged.add(e.vehicleId);
      for (const a of fleetOnMap(sim)) {
        if (!flagged.has(a.id) || a.state !== 'staged' || checked.has(a.id)) continue;
        expect(a.milesToService).toBe(FLEET_CLASSES[a.cls!].serviceIntervalMi);
        checked.add(a.id);
      }
    });
    expect(checked.size).toBeGreaterThan(0);
  });
});

describe('revenue (FE-5, D50)', () => {
  it('logs the class and booked rate on each checkout', () => {
    const sim = createSim({ seed: 'm9-checkout' });
    const events: SimEvent[] = [];
    steps(sim, 3_600, () => events.push(...sim.drainEvents()));
    const checkouts = events.filter((e) => e.type === 'checkout');
    expect(checkouts.length).toBeGreaterThan(5);
    for (const c of checkouts) expect(RATES.has(c.ratePerDay)).toBe(true);
    // Upgrades (FE-3 fallback) are the exception: most customers drive off in the class they booked.
    const own = checkouts.filter((c) => c.ratePerDay === FLEET_CLASSES[c.cls].ratePerDay).length;
    expect(own / checkouts.length).toBeGreaterThan(0.7);
  });

  it('books revenue as rentals leave, within the rate range', () => {
    const sim = createSim({ seed: 'm9-revenue' });
    steps(sim, 3_600);
    const r = sim.metrics().revenue;
    expect(r.rentalsToday).toBeGreaterThan(5);
    expect(r.total).toBeGreaterThanOrEqual(r.today);
    expect(r.today / r.rentalsToday).toBeGreaterThanOrEqual(42);
    expect(r.today / r.rentalsToday).toBeLessThanOrEqual(119 * 2);
  });

  it('counts customers waiting over 20 minutes as revenue at risk', () => {
    const sim = createSim({ seed: 'm9-risk', rateOverrides: { pickupsPerSimHour: 120 } });
    let maxCount = 0;
    steps(sim, 6_000, (i) => {
      if (i % 100 !== 0) return;
      const r = sim.metrics().revenue;
      expect(r.atRiskCount).toBeLessThanOrEqual(sim.snapshot().counterQueue);
      expect(r.atRisk).toBeGreaterThanOrEqual(r.atRiskCount * 42);
      maxCount = Math.max(maxCount, r.atRiskCount);
    });
    expect(maxCount).toBeGreaterThan(0);
  });

  it('is deterministic for a seed, revenue included (S-15, FE-7)', () => {
    const a = createSim({ seed: 'm9-det' });
    const b = createSim({ seed: 'm9-det' });
    steps(a, 3_000);
    steps(b, 3_000);
    expect(a.metrics().revenue.total).toBeGreaterThan(0);
    expect(a.metrics()).toEqual(b.metrics());
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
  });
});

describe('fog and thunderstorm (FE-6)', () => {
  const meanMovingSpeed = (mode: 'clear' | 'fog' | 'storm'): number => {
    const sim = createSim({ seed: 14, weather: mode });
    let sum = 0;
    let n = 0;
    steps(sim, 1_800, () => {
      for (const a of fleetOnMap(sim)) {
        if (a.speed > 0.5) {
          sum += a.speed;
          n++;
        }
      }
    });
    return sum / n;
  };

  it('slows traffic in fog and more in a thunderstorm', () => {
    const clear = meanMovingSpeed('clear');
    const fog = meanMovingSpeed('fog') / clear;
    const storm = meanMovingSpeed('storm') / clear;
    expect(fog).toBeLessThan(0.95);
    expect(storm).toBeLessThan(fog);
  });
});
