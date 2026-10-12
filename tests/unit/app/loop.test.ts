import { describe, expect, it } from 'vitest';
import { createAccumulator } from '../../../src/app/loop';

describe('createAccumulator (A3)', () => {
  it('runs no step until a full step has accumulated, reporting alpha', () => {
    const acc = createAccumulator(0.05, 5);
    const r = acc.push(0.016);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(0.32);
  });

  it('carries the remainder across frames', () => {
    const acc = createAccumulator(0.05, 5);
    acc.push(0.016);
    acc.push(0.016);
    acc.push(0.016);
    const r = acc.push(0.016);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0.28);
  });

  it('runs several steps for a long frame', () => {
    const acc = createAccumulator(0.05, 5);
    const r = acc.push(0.125);
    expect(r.steps).toBe(2);
    expect(r.alpha).toBeCloseTo(0.5);
  });

  it('caps steps per frame and drops the excess (no spiral of death)', () => {
    const acc = createAccumulator(0.05, 5);
    const r = acc.push(3);
    expect(r.steps).toBe(5);
    expect(r.alpha).toBeGreaterThanOrEqual(0);
    expect(r.alpha).toBeLessThan(1);
    expect(acc.push(0).steps).toBe(0);
  });

  it('treats negative and non-finite input as zero', () => {
    const acc = createAccumulator(0.05, 5);
    for (const dt of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = acc.push(dt);
      expect(r.steps).toBe(0);
      expect(r.alpha).toBeGreaterThanOrEqual(0);
      expect(r.alpha).toBeLessThan(1);
    }
  });
});
