import { notImplemented } from '../shared/notImplemented';
import type { VehicleClass } from './types';

// Customer-to-car matching (M9, FE-3, architecture F4). Pure; no random draws.

/**
 * The ready car for a customer who booked `want`: the first car of that class, else the first in the same lot row,
 * else the first ready car; null when none is ready. Order of `ready` is preserved (FIFO).
 */
export function matchCar(want: VehicleClass, ready: readonly { readonly id: string; readonly cls: VehicleClass }[]): string | null {
  return notImplemented(want, ready);
}
