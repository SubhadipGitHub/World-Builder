import { notImplemented } from '../shared/notImplemented';
import type { VehicleClass } from './types';

// Revenue (M9, FE-5, D50, architecture F6–F9). Pure.

export interface RevenueView {
  /** US$ booked since hub midnight. */
  readonly today: number;
  /** US$ booked since load. */
  readonly total: number;
  readonly rentalsToday: number;
  /** Booked daily rates of counter customers waiting longer than rates.atRiskWaitSimSec. */
  readonly atRisk: number;
  readonly atRiskCount: number;
}

export const EMPTY_REVENUE: RevenueView = { today: 0, total: 0, rentalsToday: 0, atRisk: 0, atRiskCount: 0 };

/** max(1, ⌈rental hours ÷ 24⌉). */
export function billedDays(rentalSec: number): number {
  return notImplemented(rentalSec);
}

/** The booked class's daily rate × billed days; an upgrade costs the booked rate. */
export function bookingValue(bookedCls: VehicleClass, rentalSec: number): number {
  return notImplemented(bookedCls, rentalSec);
}

export interface RevenueLedger {
  /** Books a rental at the hub clock time `clockSec` (seconds since the hub day 0 midnight). */
  book(amount: number, clockSec: number): void;
  /** Totals at `clockSec`; "today" resets at each hub midnight, even with no bookings since. */
  view(clockSec: number): Pick<RevenueView, 'today' | 'total' | 'rentalsToday'>;
}

export function createRevenueLedger(): RevenueLedger {
  return { book: notImplemented, view: notImplemented };
}

/** Counter customers who have waited longer than `waitSec`, and their booked daily rates. */
export function atRisk(
  customers: readonly { readonly cls: VehicleClass; readonly arrivedAt: number }[],
  nowSimSec: number,
  waitSec: number,
): { readonly amount: number; readonly count: number } {
  return notImplemented(customers, nowSimSec, waitSec);
}
