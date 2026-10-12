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
