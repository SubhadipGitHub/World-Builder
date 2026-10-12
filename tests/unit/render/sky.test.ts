import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import type { WeatherMode } from '../../../src/config/weather';
import { environmentFor, type DayNight } from '../../../src/render/environment';
import { skyColours } from '../../../src/render/sky';

const opts = { reducedMotion: false, qualityTier: 0 };
const sky = (weather: WeatherMode, hours: number, dn: DayNight = 'auto') => skyColours(environmentFor(weather, hours, dn, opts), weather);
const lum = (hex: string): number => {
  const c = new Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const sat = (hex: string): number => {
  const hsl = { h: 0, s: 0, l: 0 };
  new Color(hex).getHSL(hsl);
  return hsl.s;
};
const warmth = (hex: string): number => {
  const c = new Color(hex);
  return c.r - c.b;
};

describe('skyColours (V-4, P8)', () => {
  it('returns hex colours, deterministically', () => {
    const s = sky('clear', 12);
    for (const v of [s.zenith, s.horizon, s.ground]) expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(sky('clear', 12)).toEqual(s);
  });

  it('is bright by day and dark at night', () => {
    expect(lum(sky('clear', 12).zenith)).toBeGreaterThan(lum(sky('clear', 23).zenith) + 0.1);
    expect(lum(sky('clear', 12, 'night').horizon)).toBeLessThan(lum(sky('clear', 12).horizon));
  });

  it('glows warm at golden hour', () => {
    expect(warmth(sky('clear', 18.7).horizon)).toBeGreaterThan(warmth(sky('clear', 12).horizon));
  });

  it('turns grey in rain and overcast, and warm in a heatwave', () => {
    expect(sat(sky('rain', 12).zenith)).toBeLessThan(sat(sky('clear', 12).zenith));
    expect(sat(sky('overcast', 12).zenith)).toBeLessThan(sat(sky('clear', 12).zenith));
    expect(warmth(sky('heatwave', 13).horizon)).toBeGreaterThan(0);
  });
});
