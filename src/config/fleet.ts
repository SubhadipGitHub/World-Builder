import { notImplemented } from '../shared/notImplemented';
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
  economy: { label: 'Economy hatchback', mix: 0.15, length: 4.1, width: 1.75, ratePerDay: 42, serviceIntervalMi: 5_000, row: 'cars' },
  sedan: { label: 'Mid-size sedan', mix: 0.2, length: 4.8, width: 1.85, ratePerDay: 55, serviceIntervalMi: 6_000, row: 'cars' },
  luxury: { label: 'Premium saloon', mix: 0.05, length: 5.1, width: 1.9, ratePerDay: 119, serviceIntervalMi: 7_500, row: 'cars' },
  suv: { label: 'Full-size SUV', mix: 0.15, length: 5.3, width: 2.0, ratePerDay: 78, serviceIntervalMi: 6_000, row: 'large' },
  minivan: { label: '7-seat minivan', mix: 0.05, length: 5.15, width: 2.0, ratePerDay: 89, serviceIntervalMi: 5_500, row: 'large' },
  pickup: { label: 'Crew-cab pickup', mix: 0.05, length: 5.8, width: 2.0, ratePerDay: 84, serviceIntervalMi: 4_500, row: 'large' },
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
  return notImplemented(cls);
}

/** The ready-lot row a class stages in (FE-3). */
export function rowOf(cls: VehicleClass): LotRow {
  return notImplemented(cls);
}

/** Vehicles per class for a fleet of `size`, by largest remainder so the counts sum to `size` (F3). */
export function fleetCounts(size: number): Record<VehicleClass, number> {
  return notImplemented(size);
}
