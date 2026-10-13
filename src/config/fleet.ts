import type { VehicleClass } from '../sim/types';

// Rental classes (M9, FE-1, FE-2, architecture F1): the one table that the simulation, layout, render and UI read.
// Names and rates are fictional (N-7).

export type LotRow = 'cars' | 'large' | 'ev';
export type EnergyKind = 'electric' | 'petrol';

export interface FleetClass {
  /** Model label, e.g. "Crew-cab pickup". */
  readonly label: string;
  /** Share of the fleet, 0–1; all classes sum to 1. */
  readonly mix: number;
  /** Footprint in metres (P10). */
  readonly length: number;
  readonly width: number;
  /** Fictional US$ per rental day. */
  readonly ratePerDay: number;
  readonly serviceIntervalMi: number;
  readonly row: LotRow;
}

export const FLEET_CLASS_ORDER: readonly VehicleClass[] = ['economy', 'sedan', 'luxury', 'suv', 'minivan', 'pickup', 'ev'];

export const FLEET_CLASSES: Readonly<Record<VehicleClass, FleetClass>> = {
  economy: { label: 'Economy hatchback', mix: 0.15, length: 4.75, width: 1.75, ratePerDay: 42, serviceIntervalMi: 5_000, row: 'cars' },
  sedan: { label: 'Mid-size sedan', mix: 0.2, length: 4.8, width: 1.85, ratePerDay: 55, serviceIntervalMi: 6_000, row: 'cars' },
  luxury: { label: 'Premium saloon', mix: 0.05, length: 5.1, width: 1.9, ratePerDay: 119, serviceIntervalMi: 7_500, row: 'cars' },
  suv: { label: 'Full-size SUV', mix: 0.15, length: 5.3, width: 2.0, ratePerDay: 78, serviceIntervalMi: 6_000, row: 'large' },
  minivan: { label: '7-seat minivan', mix: 0.05, length: 5.15, width: 2.0, ratePerDay: 89, serviceIntervalMi: 5_500, row: 'large' },
  pickup: { label: 'Crew-cab pickup', mix: 0.05, length: 5.3, width: 2.0, ratePerDay: 84, serviceIntervalMi: 4_500, row: 'large' },
  ev: { label: 'Compact EV crossover', mix: 0.35, length: 4.75, width: 1.92, ratePerDay: 68, serviceIntervalMi: 10_000, row: 'ev' },
};

export const LOT_ROW_ORDER: readonly LotRow[] = ['cars', 'large', 'ev'];

/** Ready-lot rows (FE-3, D51): the existing three rows, regrouped by size. */
export const LOT_ROWS: Readonly<Record<LotRow, { readonly label: string; readonly stalls: number }>> = {
  cars: { label: 'Cars', stalls: 18 },
  large: { label: 'SUVs & vans', stalls: 12 },
  ev: { label: 'EV', stalls: 18 },
};

/** Electric for EVs, petrol for every other class (FE-1, F2). */
export function energyOf(cls: VehicleClass): EnergyKind {
  return cls === 'ev' ? 'electric' : 'petrol';
}

/** The ready-lot row a class stages in (FE-3). */
export function rowOf(cls: VehicleClass): LotRow {
  return FLEET_CLASSES[cls].row;
}

/** Vehicles per class for a fleet of `size`, by largest remainder so the counts sum to `size` (F3). */
export function fleetCounts(size: number): Record<VehicleClass, number> {
  // The epsilon absorbs float noise (120 × 0.15 = 17.999…), so whole shares stay whole.
  const exact = FLEET_CLASS_ORDER.map((cls) => {
    const share = size * FLEET_CLASSES[cls].mix;
    const base = Math.floor(share + 1e-9);
    return { cls, base, remainder: share - base };
  });
  const counts = Object.fromEntries(exact.map((e) => [e.cls, e.base])) as Record<VehicleClass, number>;
  let left = size - exact.reduce((n, e) => n + e.base, 0);
  // Largest remainder first; the sort is stable, so ties keep display order.
  const byRemainder = [...exact].sort((a, b) => b.remainder - a.remainder);
  for (const e of byRemainder) {
    if (left <= 0) break;
    counts[e.cls]++;
    left--;
  }
  return counts;
}
