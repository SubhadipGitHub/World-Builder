import { describe, expect, it } from 'vitest';
import { FLEET_CLASSES } from '../../../src/config/fleet';
import { initialLastService, milesToService, serviceDue } from '../../../src/sim/maintenance';
import { createRng } from '../../../src/sim/rng';

// M9 (FE-4; architecture F5).

describe('serviceDue', () => {
  it('is due exactly at the class interval, not a mile before', () => {
    expect(serviceDue(10_000 + 4_499, 10_000, 'pickup')).toBe(false);
    expect(serviceDue(10_000 + 4_500, 10_000, 'pickup')).toBe(true);
    expect(serviceDue(10_000 + 9_999, 10_000, 'ev')).toBe(false);
    expect(serviceDue(20_000, 10_000, 'ev')).toBe(true);
  });

  it('stays due when overdue', () => {
    expect(serviceDue(30_000, 10_000, 'economy')).toBe(true);
  });
});

describe('milesToService', () => {
  it('counts down from the interval and never goes negative', () => {
    expect(milesToService(12_000, 12_000, 'sedan')).toBe(6_000);
    expect(milesToService(16_760, 12_000, 'sedan')).toBe(1_240);
    expect(milesToService(18_000, 12_000, 'sedan')).toBe(0);
    expect(milesToService(25_000, 12_000, 'sedan')).toBe(0);
  });
});

describe('initialLastService', () => {
  it('starts each vehicle part-way through its interval, never ahead of its odometer', () => {
    const rng = createRng('maint');
    const offsets: number[] = [];
    for (let i = 0; i < 500; i++) {
      const odo = 20_000;
      const last = initialLastService(odo, 'minivan', rng);
      expect(last).toBeLessThanOrEqual(odo);
      expect(odo - last).toBeLessThan(FLEET_CLASSES.minivan.serviceIntervalMi);
      offsets.push(odo - last);
    }
    // Spread across the interval, so the fleet doesn't fall due together.
    expect(Math.min(...offsets)).toBeLessThan(500);
    expect(Math.max(...offsets)).toBeGreaterThan(FLEET_CLASSES.minivan.serviceIntervalMi - 500);
  });

  it('is deterministic for a seed and uses exactly one draw', () => {
    const a = createRng('x');
    const b = createRng('x');
    expect(initialLastService(9_000, 'ev', a)).toBe(initialLastService(9_000, 'ev', b));
    expect(a.next()).toBe(b.next());
  });
});
