import { airportPlan } from '../airport/plan';
import { hubBounds } from '../layout/positions';
import type { CameraLimits } from '../render/cameraMath';

/** Maximum camera distance once the airport is in the world (L-2). */
export const MAX_DISTANCE = 1100;

/**
 * Camera limits (L-2, H12): pan bounds are the union of the hub's bounds (with a 20 m margin) and
 * the airport plan's bounds; distance 25 … MAX_DISTANCE; polar limits as before (0.35 … 1.25).
 */
export function cameraLimits(): CameraLimits {
  const hub = hubBounds(20);
  const airport = airportPlan().bounds;
  return {
    minX: Math.min(hub.minX, airport.minX),
    maxX: Math.max(hub.maxX, airport.maxX),
    minZ: Math.min(hub.minZ, airport.minZ),
    maxZ: Math.max(hub.maxZ, airport.maxZ),
    minDistance: 25,
    maxDistance: MAX_DISTANCE,
    minPolar: 0.35,
    maxPolar: 1.25,
  };
}
