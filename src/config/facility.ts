import type { VehicleClass } from '../sim/types';
import { FLEET_CLASSES, FLEET_CLASS_ORDER, LOT_ROWS, LOT_ROW_ORDER, type LotRow } from './fleet';

const byClass = <T>(f: (cls: VehicleClass) => T): Record<VehicleClass, T> =>
  Object.fromEntries(FLEET_CLASS_ORDER.map((c) => [c, f(c)])) as Record<VehicleClass, T>;

// Capacities (W-5) and fleet (L-2). Lengths in metres.
export const facility = {
  returnLanes: 4,
  washBays: 2,
  serviceBays: 3,
  evChargers: 8,
  fuelPumps: 4,
  /** Ready-lot stalls per row (M9, FE-3), from config/fleet.ts (F1). */
  readySlots: Object.fromEntries(LOT_ROW_ORDER.map((r) => [r, LOT_ROWS[r].stalls])) as Record<LotRow, number>,
  exitGates: 2,
  shuttles: 2,
  carts: 3,
  maxPedestrians: 30,
  fleetSize: 120,
  /** Share of the fleet per class (M9, FE-2), from config/fleet.ts (F1). */
  fleetMix: byClass((c) => FLEET_CLASSES[c].mix),
} as const satisfies {
  readySlots: Record<LotRow, number>;
  fleetMix: Record<VehicleClass, number>;
  [key: string]: unknown;
};

export interface Dimensions {
  readonly length: number;
  readonly width: number;
}

export const dimensions = {
  // Fleet classes take their footprints from config/fleet.ts (M9, F1).
  ...byClass((c): Dimensions => ({ length: FLEET_CLASSES[c].length, width: FLEET_CLASSES[c].width })),
  shuttle: { length: 9.0, width: 2.5 },
  cart: { length: 2.4, width: 1.2 },
  tow: { length: 6.5, width: 2.3 },
  van: { length: 5.5, width: 2.0 },
  pedestrian: { length: 0.5, width: 0.5 },
} as const satisfies Record<string, Dimensions>;

/** Longest fleet car (the tow truck's carry length, M9). */
export const maxFleetLength = Math.max(...FLEET_CLASS_ORDER.map((c) => FLEET_CLASSES[c].length));

export const energy = {
  evPackKwh: 75,
  fuelTankL: 60,
  pumpLitresPerMin: 38,
  chargerKw: { min: 50, max: 250 },
} as const;
