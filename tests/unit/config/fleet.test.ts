import { describe, expect, it } from 'vitest';
import { facility, dimensions } from '../../../src/config/facility';
import { FLEET_CLASSES, FLEET_CLASS_ORDER, LOT_ROWS, LOT_ROW_ORDER, energyOf, fleetCounts, rowOf } from '../../../src/config/fleet';
import type { VehicleClass } from '../../../src/sim/types';

// M9 (FE-1, FE-2, FE-3; architecture F1–F3).

const ALL: readonly VehicleClass[] = ['economy', 'sedan', 'luxury', 'suv', 'minivan', 'pickup', 'ev'];

describe('fleet table (FE-2)', () => {
  it('lists all 7 classes once, in display order', () => {
    expect([...FLEET_CLASS_ORDER]).toEqual(ALL);
    expect(Object.keys(FLEET_CLASSES).sort()).toEqual([...ALL].sort());
  });

  it('has a mix that sums to 1 and keeps the M7 row shares (40 / 25 / 35)', () => {
    const total = ALL.reduce((s, c) => s + FLEET_CLASSES[c].mix, 0);
    expect(total).toBeCloseTo(1, 10);
    const share = (row: string): number => ALL.filter((c) => FLEET_CLASSES[c].row === row).reduce((s, c) => s + FLEET_CLASSES[c].mix, 0);
    expect(share('cars')).toBeCloseTo(0.4, 10);
    expect(share('large')).toBeCloseTo(0.25, 10);
    expect(share('ev')).toBeCloseTo(0.35, 10);
  });

  it('has the approved rates and service intervals', () => {
    expect(ALL.map((c) => FLEET_CLASSES[c].ratePerDay)).toEqual([42, 55, 119, 78, 89, 84, 68]);
    expect(ALL.map((c) => FLEET_CLASSES[c].serviceIntervalMi)).toEqual([5_000, 6_000, 7_500, 6_000, 5_500, 4_500, 10_000]);
  });

  it('fits every class in a 9 m drive-through stall and a 2.4 m stall lane (FE-3)', () => {
    for (const c of ALL) {
      expect(FLEET_CLASSES[c].length).toBeLessThanOrEqual(6);
      expect(FLEET_CLASSES[c].width).toBeLessThanOrEqual(2.1);
    }
  });

  it('uses brand-neutral model labels (N-7)', () => {
    expect(ALL.map((c) => FLEET_CLASSES[c].label)).toEqual([
      'Economy hatchback',
      'Mid-size sedan',
      'Premium saloon',
      'Full-size SUV',
      '7-seat minivan',
      'Crew-cab pickup',
      'Compact EV crossover',
    ]);
  });
});

describe('energyOf and rowOf (FE-1, FE-3)', () => {
  it('makes only EVs electric', () => {
    expect(ALL.filter((c) => energyOf(c) === 'electric')).toEqual(['ev']);
    expect(ALL.filter((c) => energyOf(c) === 'petrol')).toHaveLength(6);
  });

  it('groups the classes into the three lot rows by size', () => {
    expect(ALL.map(rowOf)).toEqual(['cars', 'cars', 'cars', 'large', 'large', 'large', 'ev']);
    expect([...LOT_ROW_ORDER]).toEqual(['cars', 'large', 'ev']);
  });
});

describe('fleetCounts (F3)', () => {
  it('splits 120 cars exactly by largest remainder', () => {
    expect(fleetCounts(120)).toEqual({ economy: 18, sedan: 24, luxury: 6, suv: 18, minivan: 6, pickup: 6, ev: 42 });
  });

  it('always sums to the fleet size', () => {
    for (const size of [1, 7, 50, 99, 120, 121, 200]) {
      const counts = fleetCounts(size);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(size);
      for (const n of Object.values(counts)) expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('facility config derived from the fleet table (F1)', () => {
  it('takes the mix and the stall counts from the fleet table', () => {
    for (const c of ALL) expect(facility.fleetMix[c]).toBeCloseTo(FLEET_CLASSES[c].mix, 10);
    expect(LOT_ROWS.cars.stalls + LOT_ROWS.large.stalls + LOT_ROWS.ev.stalls).toBe(48);
  });

  it('takes the vehicle footprints from the fleet table', () => {
    for (const c of ALL) {
      expect(dimensions[c].length).toBe(FLEET_CLASSES[c].length);
      expect(dimensions[c].width).toBe(FLEET_CLASSES[c].width);
    }
  });
});
