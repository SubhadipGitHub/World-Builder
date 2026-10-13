import { describe, expect, it } from 'vitest';
import { weatherModes } from '../../../src/config/weather';
import { windAt } from '../../../src/render/wind';

// M9 (FE-13; architecture F11).

describe('windAt', () => {
  it('stays in range for every weather, hour and moment', () => {
    for (const w of weatherModes) {
      for (let h = 0; h < 24; h += 0.5) {
        for (const t of [0, 13.7, 600, 86_399]) {
          const v = windAt(h, w, t);
          expect(v.strength).toBeGreaterThanOrEqual(0);
          expect(v.strength).toBeLessThanOrEqual(1);
          expect(v.gust).toBeGreaterThanOrEqual(0);
          expect(v.gust).toBeLessThanOrEqual(1);
          expect(Number.isFinite(v.dirRad)).toBe(true);
        }
      }
    }
  });

  it('is deterministic', () => {
    expect(windAt(15.2, 'storm', 321.5)).toEqual(windAt(15.2, 'storm', 321.5));
  });

  it('changes smoothly: less than 0.1 in strength or gust over a second', () => {
    for (let t = 0; t < 300; t += 1) {
      const a = windAt(15, 'storm', t);
      const b = windAt(15 + 1 / 3600, 'storm', t + 1);
      expect(Math.abs(b.strength - a.strength)).toBeLessThan(0.1);
      expect(Math.abs(b.gust - a.gust)).toBeLessThan(0.1);
    }
  });

  it('is calm overnight and in fog, breezy in the afternoon, strong in a thunderstorm', () => {
    const mean = (h: number, w: Parameters<typeof windAt>[1]): number => {
      let s = 0;
      for (let t = 0; t < 120; t++) s += windAt(h, w, t).strength;
      return s / 120;
    };
    expect(mean(3, 'clear')).toBeLessThan(0.25);
    expect(mean(15, 'fog')).toBeLessThan(0.15);
    expect(mean(15, 'clear')).toBeGreaterThan(mean(3, 'clear'));
    expect(mean(15, 'storm')).toBeGreaterThan(0.6);
    expect(mean(15, 'storm')).toBeGreaterThan(mean(15, 'rain'));
  });
});
