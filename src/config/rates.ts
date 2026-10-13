import type { IdmParams } from '../sim/traffic/idm';

// Lifecycle rates and durations (L-1, L-2, L-6). Durations are simulated seconds.
export const rates = {
  // 15× since M7 (D30): turnaround counts inter-station driving × this factor (§20.1).
  timeScale: 15,
  stepWallSec: 0.05,
  // M9 (FE-4): mileage-based service flags 3–5% of inspections (measured over a day), so the random wear / damage
  // roll drops from 0.10 to 0.06, for a total near 10% (Stage 4 calibration, §22.10).
  maintenanceChance: 0.06,
  // Raised from 0.02 with the lower roll, so tows stay about as frequent as in M7 (0.06 × 0.03 ≈ 0.1 × 0.02).
  severeChance: 0.03,
  evStageSocPct: 80,
  inspectionSimSec: { min: 60, max: 120 },
  // Express tunnel since M7 (D31, D32): the wash was the peak bottleneck (queue 19 at 90–180 s).
  washSimSec: { min: 45, max: 90 },
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
  /** Counter wait after which a booking counts as revenue at risk (M9, D50). */
  atRiskWaitSimSec: 1_200,
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
