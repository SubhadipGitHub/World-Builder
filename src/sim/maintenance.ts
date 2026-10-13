import { FLEET_CLASSES } from '../config/fleet';
import type { Rng } from './rng';
import type { VehicleClass } from './types';

// Mileage-based maintenance (M9, FE-4, architecture F5). Pure.

/** True once the miles since the last service reach the class interval. */
export function serviceDue(odometerMi: number, lastServiceMi: number, cls: VehicleClass): boolean {
  return odometerMi - lastServiceMi >= FLEET_CLASSES[cls].serviceIntervalMi;
}

/** Miles left until the next service; 0 when due or overdue. */
export function milesToService(odometerMi: number, lastServiceMi: number, cls: VehicleClass): number {
  return Math.max(0, FLEET_CLASSES[cls].serviceIntervalMi - (odometerMi - lastServiceMi));
}

/** Last-service odometer for a new vehicle: part-way through its interval, so the fleet doesn't fall due together. One draw. */
export function initialLastService(odometerMi: number, cls: VehicleClass, rng: Rng): number {
  return odometerMi - Math.floor(rng.next() * FLEET_CLASSES[cls].serviceIntervalMi);
}
