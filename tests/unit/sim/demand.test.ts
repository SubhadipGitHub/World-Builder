import { describe, expect, it } from 'vitest';
import { createRentPool, pickupArrivals, rentalDuration } from '../../../src/sim/demand';
import { createRng } from '../../../src/sim/rng';

describe('createRentPool (L-2)', () => {
  it('holds vehicles until their return time', () => {
    const pool = createRentPool();
    pool.add('v1', 0, 100);
    expect(pool.size).toBe(1);
    expect(pool.has('v1')).toBe(true);
    expect(pool.due(99, 10)).toEqual([]);
    expect(pool.due(100, 10)).toEqual(['v1']);
    expect(pool.size).toBe(0);
    expect(pool.has('v1')).toBe(false);
  });

  it('returns due vehicles ordered by return time, then id', () => {
    const pool = createRentPool();
    pool.add('v3', 0, 50);
    pool.add('v2', 0, 30);
    pool.add('v1', 0, 50);
    expect(pool.due(60, 10)).toEqual(['v2', 'v1', 'v3']);
  });

  it('applies back-pressure: vehicles over the limit stay due for later', () => {
    const pool = createRentPool();
    for (let i = 1; i <= 5; i++) pool.add(`v${String(i)}`, 0, i);
    expect(pool.due(10, 2)).toEqual(['v1', 'v2']);
    expect(pool.size).toBe(3);
    expect(pool.due(10, 0)).toEqual([]);
    expect(pool.due(10, 10)).toEqual(['v3', 'v4', 'v5']);
  });

  it('rejects adding a vehicle twice', () => {
    const pool = createRentPool();
    pool.add('v1', 0, 10);
    expect(() => pool.add('v1', 5, 10)).toThrow();
  });
});

describe('rentalDuration', () => {
  it('never goes below the minimum and averages near mean', () => {
    const rng = createRng(11);
    const xs = Array.from({ length: 10_000 }, () => rentalDuration(rng, 10_800, 1_800));
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(1_800);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThan(9_500);
    expect(mean).toBeLessThan(13_500);
  });
});

describe('pickupArrivals', () => {
  const totalOverHours = (factor: number, hours: number, seed: number): number => {
    const rng = createRng(seed);
    let n = 0;
    for (let t = 0; t < hours * 3_600; t += 1) n += pickupArrivals(rng, 26, 1, factor);
    return n;
  };

  it('matches the hourly rate over a long run', () => {
    const perHour = totalOverHours(1, 100, 12) / 100;
    expect(perHour).toBeGreaterThan(24);
    expect(perHour).toBeLessThan(28);
  });

  it('scales with the demand factor (heatwave +40%)', () => {
    const base = totalOverHours(1, 100, 13);
    const hot = totalOverHours(1.4, 100, 13);
    expect(hot / base).toBeGreaterThan(1.3);
    expect(hot / base).toBeLessThan(1.5);
  });

  it('returns 0 for zero time or zero factor', () => {
    const rng = createRng(14);
    expect(pickupArrivals(rng, 26, 0, 1)).toBe(0);
    expect(pickupArrivals(rng, 26, 60, 0)).toBe(0);
  });
});
