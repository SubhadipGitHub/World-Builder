import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { gateArmRotation } from '../../../src/render/world';

describe('gateArmRotation (V-9)', () => {
  // The arm's geometry reaches along −z from its pivot; its tip is ~3.3 m out.
  const tip = (lift: number, towardLane: number): Vector3 => new Vector3(0, 0, -3.3).applyQuaternion(gateArmRotation(lift, towardLane));

  it('lies flat across the lane when down', () => {
    for (const toward of [0, Math.PI]) expect(tip(0, toward).y).toBeCloseTo(0, 6);
  });

  it('swings the tip up into the air when raised, never into the ground', () => {
    for (const toward of [0, Math.PI]) {
      for (const lift of [0.25, 0.5, 1]) expect(tip(lift, toward).y).toBeGreaterThan(0);
      expect(tip(1, toward).y).toBeCloseTo(3.3, 6);
    }
  });

  it('reaches across its own lane: −z for the north lane, +z for the south lane', () => {
    expect(tip(0, 0).z).toBeLessThan(0);
    expect(tip(0, Math.PI).z).toBeGreaterThan(0);
  });
});
