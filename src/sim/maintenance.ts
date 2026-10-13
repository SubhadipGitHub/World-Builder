import { notImplemented } from '../shared/notImplemented';
import type { Rng } from './rng';
import type { VehicleClass } from './types';

// Mileage-based maintenance (M9, FE-4, architecture F5). Pure.

/** True once the miles since the last service reach the class interval. */
export function serviceDue(odometerMi: number, lastServiceMi: number, cls: VehicleClass): boolean {
  return notImplemented(odometerMi, lastServiceMi, cls);
}

/** Miles left until the next service; 0 when due or overdue. */
export function milesToService(odometerMi: number, lastServiceMi: number, cls: VehicleClass): number {
  return notImplemented(odometerMi, lastServiceMi, cls);
}

/** Last-service odometer for a new vehicle: part-way through its interval, so the fleet doesn't fall due together. One draw. */
export function initialLastService(odometerMi: number, cls: VehicleClass, rng: Rng): number {
  return notImplemented(odometerMi, cls, rng);
}
