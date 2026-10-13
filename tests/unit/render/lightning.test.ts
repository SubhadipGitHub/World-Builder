import { describe, expect, it } from 'vitest';
import {
  MAX_FLASH_LIGHT,
  MAX_FLICKER_HZ,
  MAX_STRIKE_GAP_SEC,
  MIN_STRIKE_GAP_SEC,
  REDUCED_FLASH_LIGHT,
  createLightningSchedule,
  flashLevel,
} from '../../../src/render/lightning';

// M9 (FE-12; architecture F11, F12). Photosensitivity limits (WCAG 2.3.1) are pinned numerically.

describe('createLightningSchedule', () => {
  // Built lazily, so each test reports its own failure.
  const sched = () => createLightningSchedule('goldlane');
  const hourOf = () => sched().strikesBetween(0, 3600);

  it('strikes every 8–25 s', () => {
    const hour = hourOf();
    expect(hour.length).toBeGreaterThanOrEqual(3600 / MAX_STRIKE_GAP_SEC - 1);
    expect(hour.length).toBeLessThanOrEqual(3600 / MIN_STRIKE_GAP_SEC + 1);
    for (let i = 1; i < hour.length; i++) {
      const gap = hour[i]!.t - hour[i - 1]!.t;
      expect(gap).toBeGreaterThanOrEqual(MIN_STRIKE_GAP_SEC);
      expect(gap).toBeLessThanOrEqual(MAX_STRIKE_GAP_SEC);
    }
  });

  it('delays thunder by 1–4 s and places strikes at a distance', () => {
    for (const s of hourOf()) {
      expect(s.thunderDelaySec).toBeGreaterThanOrEqual(1);
      expect(s.thunderDelaySec).toBeLessThanOrEqual(4);
      expect(s.distanceM).toBeGreaterThan(0);
    }
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(createLightningSchedule('goldlane').strikesBetween(0, 600)).toEqual(sched().strikesBetween(0, 600));
    expect(createLightningSchedule('other').strikesBetween(0, 600)).not.toEqual(sched().strikesBetween(0, 600));
  });

  it('returns each strike once across consecutive windows (frames)', () => {
    const s = sched();
    let n = 0;
    for (let t = 0; t < 600; t += 1 / 60) n += s.strikesBetween(t, t + 1 / 60).length;
    expect(n).toBe(s.strikesBetween(0, 600).length);
  });

  it('knows the latest strike', () => {
    const s = sched();
    const first = s.strikesBetween(0, 3600)[0]!;
    expect(s.last(first.t - 0.01)).toBeNull();
    expect(s.last(first.t + 0.5)).toEqual(first);
  });
});

describe('flashLevel (F12)', () => {
  const sample = (reducedMotion: boolean) => {
    const strike = createLightningSchedule('goldlane').strikesBetween(0, 120)[0]!;
    const out: { t: number; light: number; sky: number; bolt: boolean }[] = [];
    for (let dt = -0.5; dt < 4; dt += 0.01) out.push({ t: dt, ...flashLevel(strike.t + dt, strike, { reducedMotion }) });
    return out;
  };

  it('is dark with no strike and before the strike', () => {
    expect(flashLevel(10, null, { reducedMotion: false })).toEqual({ light: 0, sky: 0, bolt: false });
    for (const s of sample(false).filter((x) => x.t < 0)) expect(s.light).toBe(0);
  });

  it('caps the brightness and fades within 2 s', () => {
    const s = sample(false);
    expect(Math.max(...s.map((x) => x.light))).toBeGreaterThan(0.2);
    for (const x of s) {
      expect(x.light).toBeLessThanOrEqual(MAX_FLASH_LIGHT);
      expect(x.sky).toBeLessThanOrEqual(1);
    }
    for (const x of s.filter((v) => v.t > 2)) expect(x.light).toBe(0);
  });

  it('flickers at most 2 pulses, no faster than 3 Hz', () => {
    const s = sample(false);
    const peaks: number[] = [];
    for (let i = 1; i < s.length - 1; i++) {
      if (s[i]!.light > 0.05 && s[i]!.light >= s[i - 1]!.light && s[i]!.light > s[i + 1]!.light) peaks.push(s[i]!.t);
    }
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    expect(peaks.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]! - peaks[i - 1]!).toBeGreaterThanOrEqual(1 / MAX_FLICKER_HZ);
    expect(s.some((x) => x.bolt)).toBe(true);
  });

  it('with reduced motion: one soft pulse, no bolt', () => {
    const s = sample(true);
    expect(s.some((x) => x.bolt)).toBe(false);
    expect(Math.max(...s.map((x) => x.light))).toBeLessThanOrEqual(REDUCED_FLASH_LIGHT);
    let peaks = 0;
    for (let i = 1; i < s.length - 1; i++) if (s[i]!.light > 0.02 && s[i]!.light >= s[i - 1]!.light && s[i]!.light > s[i + 1]!.light) peaks++;
    expect(peaks).toBe(1);
    // Rises over about half a second rather than snapping on.
    const rise = s.find((x) => x.light >= 0.9 * REDUCED_FLASH_LIGHT)!;
    expect(rise.t).toBeGreaterThanOrEqual(0.2);
  });
});
