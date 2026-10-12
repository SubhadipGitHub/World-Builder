import { describe, expect, it } from 'vitest';
import { environmentFor } from '../../../src/render/environment';

const opts = { reducedMotion: false, qualityTier: 0 };

describe('environmentFor: day and night (X-2)', () => {
  it('forces noon or 22:00 when day or night is chosen', () => {
    expect(environmentFor('clear', 3, 'day', opts)).toMatchObject({ hours: 12, nightFactor: 0 });
    expect(environmentFor('clear', 12, 'night', opts)).toMatchObject({ hours: 22, nightFactor: 1 });
  });

  it('follows the clock in auto, blending over an hour at sunrise and sunset', () => {
    const nf = (h: number) => environmentFor('clear', h, 'auto', opts).nightFactor;
    expect(nf(12)).toBe(0);
    expect(nf(2)).toBe(1);
    expect(nf(18.4)).toBe(0);
    expect(nf(19)).toBeCloseTo(0.5);
    expect(nf(19.6)).toBe(1);
    expect(nf(5.4)).toBe(1);
    expect(nf(6)).toBeCloseTo(0.5);
    expect(nf(6.6)).toBe(0);
    for (let h = 18.5; h < 19.5; h += 0.1) expect(nf(h + 0.1)).toBeGreaterThanOrEqual(nf(h) - 1e-9);
  });

  it('puts the sun up by day and down at night, with less light at night', () => {
    const day = environmentFor('clear', 12, 'auto', opts);
    const night = environmentFor('clear', 23, 'auto', opts);
    expect(day.sunElevation).toBeGreaterThan(0.5);
    expect(night.sunElevation).toBeLessThan(0);
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity);
    expect(night.ambientIntensity).toBeLessThan(day.ambientIntensity);
  });
});

describe('environmentFor: weather (X-1)', () => {
  it('keeps clear weather dry and fog-free', () => {
    expect(environmentFor('clear', 12, 'auto', opts)).toMatchObject({ fogDensity: 0, wetness: 0, rain: false, heat: false, shimmer: false });
  });

  it('dims overcast skies and adds haze', () => {
    const clear = environmentFor('clear', 12, 'auto', opts);
    const overcast = environmentFor('overcast', 12, 'auto', opts);
    expect(overcast.sunIntensity).toBeLessThan(clear.sunIntensity);
    expect(overcast.fogDensity).toBeGreaterThan(0);
    expect(overcast.rain).toBe(false);
  });

  it('makes rain wet and foggy, day or night', () => {
    const rain = environmentFor('rain', 12, 'auto', opts);
    expect(rain).toMatchObject({ rain: true, wetness: 1 });
    expect(rain.fogDensity).toBeGreaterThan(environmentFor('overcast', 12, 'auto', opts).fogDensity);
    expect(environmentFor('rain', 12, 'night', opts)).toMatchObject({ rain: true, nightFactor: 1 });
  });

  it('turns on heat, with shimmer only when motion is allowed and quality permits (N-5, N-2)', () => {
    expect(environmentFor('heatwave', 14, 'auto', opts)).toMatchObject({ heat: true, shimmer: true });
    expect(environmentFor('heatwave', 14, 'auto', { reducedMotion: true, qualityTier: 0 }).shimmer).toBe(false);
    expect(environmentFor('heatwave', 14, 'auto', { reducedMotion: false, qualityTier: 1 }).shimmer).toBe(false);
  });

  it('is a pure function', () => {
    expect(environmentFor('rain', 20.3, 'auto', opts)).toEqual(environmentFor('rain', 20.3, 'auto', opts));
  });
});
