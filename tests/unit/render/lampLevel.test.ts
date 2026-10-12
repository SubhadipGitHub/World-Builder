import { describe, expect, it } from 'vitest';
import { LAMP_FADE_SEC, LAMP_MAX_DELAY_SEC, lampDelay, lampLevel } from '../../../src/render/lampLevel';

describe('lampDelay (V-6 stagger)', () => {
  it('is deterministic, in range and well spread', () => {
    const delays = Array.from({ length: 100 }, (_, i) => lampDelay(i));
    expect(delays).toEqual(Array.from({ length: 100 }, (_, i) => lampDelay(i)));
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(LAMP_MAX_DELAY_SEC);
    }
    expect(Math.min(...delays)).toBeLessThan(0.3);
    expect(Math.max(...delays)).toBeGreaterThan(LAMP_MAX_DELAY_SEC - 0.3);
    expect(new Set(delays.map((d) => Math.floor(d * 10))).size).toBeGreaterThanOrEqual(20);
  });
});

describe('lampLevel', () => {
  it('waits for the lamp’s delay, fades in, then stays fully on', () => {
    for (let i = 0; i < 30; i++) {
      const d = lampDelay(i);
      expect(lampLevel(true, Math.max(0, d - 0.01), i, false)).toBe(0);
      expect(lampLevel(true, d + LAMP_FADE_SEC + 0.01, i, false)).toBe(1);
      let prev = 0;
      for (let t = 0; t < LAMP_MAX_DELAY_SEC + 1; t += 0.05) {
        const v = lampLevel(true, t, i, false);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
    }
  });

  it('switches off in the same staggered way', () => {
    for (let i = 0; i < 10; i++) {
      for (const t of [0, 0.5, 1.2, 2.7, 4]) expect(lampLevel(false, t, i, false)).toBeCloseTo(1 - lampLevel(true, t, i, false), 10);
    }
  });

  it('skips the stagger and fade with reduced motion (N-5)', () => {
    expect(lampLevel(true, 0, 7, true)).toBe(1);
    expect(lampLevel(false, 0, 7, true)).toBe(0);
  });
});
