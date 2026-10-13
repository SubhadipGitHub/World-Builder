import { describe, expect, it } from 'vitest';
import { cumulativeDemand, dayCurve, periodOf, warpReturn } from '../../../src/sim/demand';
import { createRng } from '../../../src/sim/rng';

// Requirements R-3, R-4; architecture §20 K5, K6.

const mean24 = (): number => {
  let s = 0;
  const n = 24 * 60;
  for (let i = 0; i < n; i++) s += dayCurve((i + 0.5) / 60);
  return s / n;
};

describe('dayCurve (R-3)', () => {
  it('has a 24 h mean of exactly 1', () => {
    expect(mean24()).toBeCloseTo(1, 6);
  });

  it('follows the R-3 bands: quiet overnight, a morning peak and a softened evening peak (D34)', () => {
    const at = (h: number): number => dayCurve(h);
    expect(at(2.5)).toBeLessThan(0.3);
    expect(at(8.5)).toBeGreaterThan(1.5);
    expect(at(13)).toBeGreaterThan(0.9);
    expect(at(13)).toBeLessThan(1.15);
    // D34: the evening band is ×1.4 (was ×1.8), so evening pickups stay near the exit gates' capacity.
    expect(at(18)).toBeGreaterThan(1.4);
    expect(at(18)).toBeLessThan(1.55);
    expect(at(8.5)).toBeGreaterThan(at(18));
    expect(at(22)).toBeLessThan(0.85);
    // Normalised from the raw band values in the same proportion.
    expect(at(18) / at(13)).toBeCloseTo(1.4, 1);
  });

  it('is continuous (no steps) and wraps around midnight', () => {
    for (let h = 0; h < 24; h += 0.01) expect(Math.abs(dayCurve(h + 0.01) - dayCurve(h))).toBeLessThan(0.02);
    expect(dayCurve(25)).toBeCloseTo(dayCurve(1), 9);
    expect(dayCurve(-1)).toBeCloseTo(dayCurve(23), 9);
    expect(Math.abs(dayCurve(23.999) - dayCurve(0))).toBeLessThan(0.01);
  });

  it('names the period of each band', () => {
    expect(periodOf(3)).toBe('Overnight');
    expect(periodOf(6)).toBe('Early morning');
    expect(periodOf(8)).toBe('Morning peak');
    expect(periodOf(12)).toBe('Midday');
    expect(periodOf(17.5)).toBe('Evening peak');
    expect(periodOf(22)).toBe('Late evening');
    expect(periodOf(26)).toBe('Overnight');
  });
});

describe('cumulativeDemand', () => {
  it('starts at 0, grows monotonically and adds 24 per day', () => {
    expect(cumulativeDemand(0)).toBe(0);
    expect(cumulativeDemand(24)).toBeCloseTo(24, 6);
    expect(cumulativeDemand(48)).toBeCloseTo(48, 6);
    for (let h = 0; h < 48; h += 0.25) expect(cumulativeDemand(h + 0.25)).toBeGreaterThan(cumulativeDemand(h));
    expect(cumulativeDemand(30) - cumulativeDemand(6)).toBeCloseTo(24, 6);
  });
});

describe('warpReturn (R-4, K6)', () => {
  const HOUR = 3600;
  const MEAN = 3.9 * HOUR;
  const MIN = 30 * 60;

  it('never returns sooner than the minimum', () => {
    for (const pickup of [0, 3 * HOUR, 8 * HOUR, 18 * HOUR]) {
      expect(warpReturn(pickup, 60, MIN)).toBeGreaterThanOrEqual(MIN);
    }
  });

  it('keeps the mean duration over a day of pickups, and clusters returns at the peaks', () => {
    const rng = createRng('warp');
    const byHour = new Array<number>(24).fill(0);
    let total = 0;
    let real = 0;
    const N = 40_000;
    for (let i = 0; i < N; i++) {
      // Pickups arrive in proportion to the curve, as in the simulation (R-3), over many days.
      // (For that distribution the mean real duration equals the drawn mean exactly.)
      let pickup = rng.range(0, 10 * 24 * HOUR);
      while (rng.next() * 2 > dayCurve(pickup / HOUR)) pickup = rng.range(0, 10 * 24 * HOUR);
      const d = Math.max(MIN, rng.exponential(MEAN));
      const back = warpReturn(pickup, d, MIN);
      real += back;
      total += d;
      byHour[Math.floor(((pickup + back) / HOUR) % 24)]! += 1;
    }
    expect(real / total).toBeGreaterThan(0.95);
    expect(real / total).toBeLessThan(1.05);
    const meanPerHour = N / 24;
    const peak = (byHour[8]! + byHour[9]! + byHour[17]! + byHour[18]!) / 4;
    const night = (byHour[1]! + byHour[2]! + byHour[3]!) / 3;
    expect(peak).toBeGreaterThanOrEqual(1.4 * meanPerHour);
    expect(night).toBeLessThanOrEqual(0.5 * meanPerHour);
  }, 60_000);
});
