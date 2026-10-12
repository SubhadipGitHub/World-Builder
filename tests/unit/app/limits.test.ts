import { describe, expect, it } from 'vitest';
import { airportPlan } from '../../../src/airport/plan';
import { MAX_DISTANCE, cameraLimits } from '../../../src/app/limits';
import { hubBounds } from '../../../src/layout/positions';

describe('cameraLimits (L-2, H12)', () => {
  it('covers the hub and the whole airport, out to 1,100 m', () => {
    const l = cameraLimits();
    const hub = hubBounds(20);
    const airport = airportPlan().bounds;
    expect(l.minX).toBe(Math.min(hub.minX, airport.minX));
    expect(l.maxX).toBe(Math.max(hub.maxX, airport.maxX));
    expect(l.minZ).toBe(Math.min(hub.minZ, airport.minZ));
    expect(l.maxZ).toBe(Math.max(hub.maxZ, airport.maxZ));
    expect(l.maxDistance).toBe(MAX_DISTANCE);
    expect(MAX_DISTANCE).toBe(1100);
    expect(l).toMatchObject({ minDistance: 25, minPolar: 0.35, maxPolar: 1.25 });
  });
});
