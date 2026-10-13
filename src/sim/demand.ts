import type { Rng } from './rng';

/** Off-map pool of vehicles out on rent (requirements L-2). */
export interface RentPool {
  readonly size: number;
  /** Throws if the vehicle is already in the pool. */
  add(vehicleId: string, nowSimSec: number, durationSimSec: number): void;
  has(vehicleId: string): boolean;
  /**
   * Removes and returns up to `limit` vehicles whose return time is <= now,
   * ordered by return time then id. Vehicles over the limit stay due (back-pressure).
   */
  due(nowSimSec: number, limit: number): readonly string[];
  /**
   * Surge (S-1, W5): the `n` rentals due soonest become due at `nowSimSec`, keeping their order.
   * Returns their ids (fewer if the pool is smaller). Rentals already due are left as they are.
   */
  pullForward(n: number, nowSimSec: number): readonly string[];
}

interface Rental {
  readonly id: string;
  readonly returnAt: number;
}

const byReturn = (a: Rental, b: Rental): number => a.returnAt - b.returnAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createRentPool(): RentPool {
  // Kept sorted by (returnAt, id).
  const rentals: Rental[] = [];
  const ids = new Set<string>();
  return {
    get size() {
      return rentals.length;
    },
    add(vehicleId, nowSimSec, durationSimSec) {
      if (ids.has(vehicleId)) throw new Error(`${vehicleId} is already on rent`);
      const rental = { id: vehicleId, returnAt: nowSimSec + durationSimSec };
      let i = rentals.length;
      while (i > 0 && byReturn(rentals[i - 1] as Rental, rental) > 0) i--;
      rentals.splice(i, 0, rental);
      ids.add(vehicleId);
    },
    has: (vehicleId) => ids.has(vehicleId),
    due(nowSimSec, limit) {
      let n = 0;
      while (n < rentals.length && n < limit && (rentals[n] as Rental).returnAt <= nowSimSec) n++;
      const out = rentals.splice(0, n).map((r) => r.id);
      for (const id of out) ids.delete(id);
      return out;
    },
    pullForward(n, nowSimSec) {
      // Rentals are sorted by return time: skip those already due, then take the next n.
      let first = 0;
      while (first < rentals.length && (rentals[first] as Rental).returnAt <= nowSimSec) first++;
      const pulled = rentals.slice(first, first + Math.max(0, n));
      // Same relative order, all due now: they stay sorted after the already-due ones.
      for (let i = 0; i < pulled.length; i++) rentals[first + i] = { id: (pulled[i] as Rental).id, returnAt: nowSimSec };
      return pulled.map((r) => r.id);
    },
  };
}

/** Rental length: exponential with the given mean, never below minSimSec. */
export function rentalDuration(rng: Rng, meanSimSec: number, minSimSec: number): number {
  return Math.max(minSimSec, rng.exponential(meanSimSec));
}

/** Customers arriving to collect cars during dt: Poisson(ratePerHour × factor × dt / 3600). */
export function pickupArrivals(rng: Rng, ratePerSimHour: number, dtSimSec: number, factor: number): number {
  if (dtSimSec <= 0 || factor <= 0) return 0;
  return rng.poisson((ratePerSimHour * factor * dtSimSec) / 3600);
}

// ---------- M7: airport day curve (requirements R-3, R-4; architecture §20 K5, K6) ----------

export type DemandPeriod = 'Overnight' | 'Early morning' | 'Morning peak' | 'Midday' | 'Evening peak' | 'Late evening';

/** R-3 bands: [from, to, raw multiplier, name]. */
const BANDS: readonly (readonly [number, number, number, DemandPeriod])[] = [
  [0, 5, 0.2, 'Overnight'],
  [5, 7, 0.8, 'Early morning'],
  [7, 10, 1.6, 'Morning peak'],
  [10, 16, 1.0, 'Midday'],
  [16, 20, 1.4, 'Evening peak'],
  [20, 24, 0.7, 'Late evening'],
];

/** Raw anchors at band mid-points, plus the wrapped values at 0 h and 24 h. */
const ANCHORS: readonly (readonly [number, number])[] = (() => {
  const mids = BANDS.map(([a, b, v]) => [(a + b) / 2, v] as const);
  const first = mids[0] as readonly [number, number];
  const last = mids[mids.length - 1] as readonly [number, number];
  // Value at midnight, on the line from the last mid-point to the first one of the next day.
  const atMidnight = last[1] + ((24 - last[0]) / (first[0] + 24 - last[0])) * (first[1] - last[1]);
  return [[0, atMidnight], ...mids, [24, atMidnight]];
})();

const rawAt = (h: number): number => {
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x1, y1] = ANCHORS[i] as readonly [number, number];
    if (h <= x1) {
      const [x0, y0] = ANCHORS[i - 1] as readonly [number, number];
      return y0 + ((h - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return (ANCHORS[ANCHORS.length - 1] as readonly [number, number])[1];
};

/** ∫ raw curve from 0 to h, for h in [0, 24]. */
const rawIntegral = (h: number): number => {
  let total = 0;
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x0, y0] = ANCHORS[i - 1] as readonly [number, number];
    const [x1] = ANCHORS[i] as readonly [number, number];
    if (h <= x0) break;
    const x = Math.min(h, x1);
    total += ((y0 + rawAt(x)) / 2) * (x - x0);
  }
  return total;
};

/** Raw daily total; dividing by it (× 24) makes the 24 h mean exactly 1. */
const RAW_DAY = rawIntegral(24);
const wrap = (h: number): number => ((h % 24) + 24) % 24;

/**
 * Demand multiplier at a hub clock hour in [0, 24) (wraps outside): piecewise linear through the
 * R-3 values placed at the mid-point of each band, normalised so the 24 h mean is exactly 1.
 * Bands: 00–05 ×0.2, 05–07 ×0.8, 07–10 ×1.6, 10–16 ×1.0, 16–20 ×1.8, 20–24 ×0.7 (before normalising).
 */
export function dayCurve(hours: number): number {
  return (rawAt(wrap(hours)) * 24) / RAW_DAY;
}

/** Name of the R-3 band containing the hour. */
export function periodOf(hours: number): DemandPeriod {
  const h = wrap(hours);
  return (BANDS.find(([a, b]) => h >= a && h < b) ?? BANDS[0])?.[3] ?? 'Overnight';
}

/** ∫ dayCurve from hour 0 to `hours` (hours ≥ 0, unbounded: +24 per day). Monotonic. */
export function cumulativeDemand(hours: number): number {
  const days = Math.floor(hours / 24);
  return days * 24 + (rawIntegral(hours - days * 24) * 24) / RAW_DAY;
}

/**
 * Seconds from a pickup at hub clock `pickupClockSec` (seconds since 00:00 of day 0) until the car
 * returns, for a drawn duration (K6): the time at which the curve-weighted clock has advanced by
 * `durationSec`. Never less than `minSec`.
 */
export function warpReturn(pickupClockSec: number, durationSec: number, minSec: number): number {
  const h0 = pickupClockSec / 3600;
  // Shift to a non-negative day so cumulativeDemand's day arithmetic holds.
  const shift = h0 < 0 ? Math.ceil(-h0 / 24) * 24 : 0;
  const start = h0 + shift;
  const target = cumulativeDemand(start) + durationSec / 3600;
  let lo = start;
  let hi = start + 24 + durationSec / 3600 / 0.1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cumulativeDemand(mid) < target) lo = mid;
    else hi = mid;
  }
  return Math.max(minSec, (hi - start) * 3600);
}
