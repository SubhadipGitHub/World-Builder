import type { IdmParams } from '../sim/traffic/idm';

// Lifecycle rates and durations (L-1, L-2, L-6). Durations are simulated seconds.
export const rates = {
  timeScale: 20,
  stepWallSec: 0.05,
  maintenanceChance: 0.1,
  severeChance: 0.02,
  evStageSocPct: 80,
  inspectionSimSec: { min: 60, max: 120 },
  washSimSec: { min: 90, max: 180 },
  serviceSimSec: { min: 900, max: 2400 },
  // Compressed so the on-rent pool settles near 65% utilisation at 20x
  // (Little's law: 20 pickups/h × 3.9 h ≈ 78 of 120 cars on rent).
  meanRentalSimSec: 3.9 * 3600,
  minRentalSimSec: 30 * 60,
  pickupsPerSimHour: 20,
  rentalMiles: { min: 40, max: 600 },
  returnFuelPct: { min: 10, max: 90 },
  returnSocPct: { min: 15, max: 75 },
  gridlockSimSec: 600,
  lookAheadM: 60,
} as const;

export const idm = {
  lot: { v0: 6.7, a: 1.2, b: 2.0, T: 1.2, s0: 1.5, delta: 4 },
  road: { v0: 11.0, a: 2.0, b: 2.5, T: 1.2, s0: 1.5, delta: 4 },
  shuttle: { v0: 9.0, a: 0.9, b: 1.6, T: 1.5, s0: 2.0, delta: 4 },
  cart: { v0: 5.0, a: 1.0, b: 2.0, T: 1.0, s0: 1.0, delta: 4 },
  pedestrian: { v0: 1.4, a: 0.8, b: 1.5, T: 0.6, s0: 0.4, delta: 4 },
} as const satisfies Record<string, IdmParams>;

// Higher wins a tie at a conflict zone (architecture §4.3).
export const priority = { pedestrian: 5, tow: 4, shuttle: 3, fleet: 2, van: 2, cart: 1 } as const;
