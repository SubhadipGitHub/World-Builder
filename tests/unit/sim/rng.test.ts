import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/sim/rng';

const draw = (seed: number | string, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('createRng (A9 determinism)', () => {
  it('replays the same sequence for the same numeric seed', () => {
    expect(draw(42, 100)).toEqual(draw(42, 100));
  });

  it('replays the same sequence for the same string seed', () => {
    expect(draw('goldlane', 50)).toEqual(draw('goldlane', 50));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(1, 20)).not.toEqual(draw(2, 20));
    expect(draw('a', 20)).not.toEqual(draw('b', 20));
  });

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const xs = draw(7, 20_000);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mean(xs)).toBeCloseTo(0.5, 1);
  });

  it('int(min, max) is inclusive and reaches both bounds', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = rng.int(2, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  it('range(min, max) stays in [min, max)', () => {
    const rng = createRng(4);
    for (let i = 0; i < 2_000; i++) {
      const v = rng.range(-3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
    }
  });

  it('chance() honours the extremes and the probability', () => {
    const rng = createRng(5);
    const n = 10_000;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
      if (rng.chance(0.1)) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.08);
    expect(hits / n).toBeLessThan(0.12);
  });

  it('pick() returns members and throws on an empty array', () => {
    const rng = createRng(6);
    const items = ['sedan', 'suv', 'ev'] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });

  it('normal() has roughly the requested mean and spread', () => {
    const rng = createRng(8);
    const xs = Array.from({ length: 20_000 }, () => rng.normal(10, 2));
    const m = mean(xs);
    const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    expect(m).toBeCloseTo(10, 0);
    expect(sd).toBeGreaterThan(1.8);
    expect(sd).toBeLessThan(2.2);
  });

  it('exponential() is positive with roughly the requested mean', () => {
    const rng = createRng(9);
    const xs = Array.from({ length: 20_000 }, () => rng.exponential(300));
    for (const x of xs) expect(x).toBeGreaterThan(0);
    expect(mean(xs)).toBeGreaterThan(285);
    expect(mean(xs)).toBeLessThan(315);
  });

  it('poisson() returns non-negative integers with mean ≈ lambda, and 0 for lambda 0', () => {
    const rng = createRng(10);
    const xs = Array.from({ length: 20_000 }, () => rng.poisson(2.5));
    for (const x of xs) {
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
    }
    expect(mean(xs)).toBeCloseTo(2.5, 1);
    expect(rng.poisson(0)).toBe(0);
  });
});
