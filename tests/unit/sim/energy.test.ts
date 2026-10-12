import { describe, expect, it } from 'vitest';
import { chargeSoc, refuel, secondsToSoc } from '../../../src/sim/energy';

describe('energy', () => {
  it('chargeSoc adds energy at constant power', () => {
    // 150 kW for 6 minutes = 15 kWh = 20% of a 75 kWh pack.
    expect(chargeSoc(30, 150, 75, 360)).toBeCloseTo(50);
  });

  it('chargeSoc caps at 100 and never decreases', () => {
    expect(chargeSoc(95, 250, 75, 3_600)).toBe(100);
    expect(chargeSoc(40, 150, 75, 0)).toBe(40);
  });

  it('secondsToSoc inverts chargeSoc and is 0 when already charged', () => {
    const t = secondsToSoc(30, 80, 150, 75);
    expect(t).toBeCloseTo(900);
    expect(chargeSoc(30, 150, 75, t)).toBeCloseTo(80);
    expect(secondsToSoc(85, 80, 150, 75)).toBe(0);
  });

  it('refuel pumps at the given rate and caps at 100', () => {
    // 38 L/min for 30 s = 19 L ≈ 31.7% of a 60 L tank.
    expect(refuel(20, 38, 60, 30)).toBeCloseTo(20 + (19 / 60) * 100);
    expect(refuel(90, 38, 60, 600)).toBe(100);
  });
});
