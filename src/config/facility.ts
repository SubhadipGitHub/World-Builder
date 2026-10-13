import type { VehicleClass } from '../sim/types';

// Capacities (W-5) and fleet (L-2). Lengths in metres.
export const facility = {
  returnLanes: 4,
  washBays: 2,
  serviceBays: 3,
  evChargers: 8,
  fuelPumps: 4,
  // Stage 3 (M9): new classes have no stalls or share yet; Stage 4 derives both from config/fleet.ts (F1).
  readySlots: { economy: 0, sedan: 18, luxury: 0, suv: 12, minivan: 0, pickup: 0, ev: 18 },
  exitGates: 2,
  shuttles: 2,
  carts: 3,
  maxPedestrians: 30,
  fleetSize: 120,
  fleetMix: { economy: 0, sedan: 0.4, luxury: 0, suv: 0.25, minivan: 0, pickup: 0, ev: 0.35 },
} as const satisfies {
  readySlots: Record<VehicleClass, number>;
  fleetMix: Record<VehicleClass, number>;
  [key: string]: unknown;
};

export interface Dimensions {
  readonly length: number;
  readonly width: number;
}

export const dimensions = {
  sedan: { length: 4.8, width: 1.85 },
  suv: { length: 5.3, width: 2.0 },
  ev: { length: 4.75, width: 1.92 },
  economy: { length: 4.1, width: 1.75 },
  luxury: { length: 5.1, width: 1.9 },
  minivan: { length: 5.15, width: 2.0 },
  pickup: { length: 5.8, width: 2.0 },
  shuttle: { length: 9.0, width: 2.5 },
  cart: { length: 2.4, width: 1.2 },
  tow: { length: 6.5, width: 2.3 },
  van: { length: 5.5, width: 2.0 },
  pedestrian: { length: 0.5, width: 0.5 },
} as const satisfies Record<string, Dimensions>;

export const energy = {
  evPackKwh: 75,
  fuelTankL: 60,
  pumpLitresPerMin: 38,
  chargerKw: { min: 50, max: 250 },
} as const;
