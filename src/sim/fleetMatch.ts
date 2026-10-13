import { rowOf } from '../config/fleet';
import type { VehicleClass } from './types';

// Customer-to-car matching (M9, FE-3, architecture F4). Pure; no random draws.

/**
 * The ready car for a customer who booked `want`: the first car of that class, else the first in the same lot row,
 * else the first ready car; null when none is ready. Order of `ready` is preserved (FIFO).
 */
export function matchCar(want: VehicleClass, ready: readonly { readonly id: string; readonly cls: VehicleClass }[]): string | null {
  const row = rowOf(want);
  return (ready.find((c) => c.cls === want) ?? ready.find((c) => rowOf(c.cls) === row) ?? ready[0])?.id ?? null;
}
