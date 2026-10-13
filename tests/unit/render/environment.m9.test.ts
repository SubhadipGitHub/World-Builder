import { describe, expect, it } from 'vitest';
import { environmentFor } from '../../../src/render/environment';

// M9 (FE-11, FE-12, FE-13): fog, thunderstorm, morning mist, wind and the flash in the environment.

const opts = { reducedMotion: false, qualityTier: 0 };

describe('environmentFor: fog (FE-11)', () => {
  it('is dense, flagged and lights the headlights by day', () => {
    const fog = environmentFor('fog', 12, 'auto', opts);
    const rain = environmentFor('rain', 12, 'auto', opts);
    expect(fog.fog).toBe(true);
    expect(fog.fogDensity).toBeGreaterThan(2 * rain.fogDensity);
    expect(fog.headlightsByDay).toBe(true);
    expect(fog.rain).toBe(false);
    expect(fog.wetness).toBeLessThan(0.5);
  });

  it('keeps the other modes without daytime headlights', () => {
    for (const w of ['clear', 'overcast', 'rain', 'storm', 'heatwave'] as const) expect(environmentFor(w, 12, 'auto', opts).headlightsByDay).toBe(false);
  });
});

describe('environmentFor: thunderstorm (FE-12)', () => {
  it('is rain plus storm: wet, dark and windy', () => {
    const storm = environmentFor('storm', 12, 'auto', { ...opts, tSec: 100 });
    const rain = environmentFor('rain', 12, 'auto', { ...opts, tSec: 100 });
    expect(storm).toMatchObject({ rain: true, storm: true, wetness: 1 });
    expect(storm.sunIntensity).toBeLessThan(rain.sunIntensity);
    expect(storm.wind.strength).toBeGreaterThan(rain.wind.strength);
  });

  it('passes the lightning flash through, capped at 1', () => {
    expect(environmentFor('storm', 22, 'auto', { ...opts, flash: 0.5 }).flash).toBe(0.5);
    expect(environmentFor('storm', 22, 'auto', { ...opts, flash: 3 }).flash).toBe(1);
    expect(environmentFor('clear', 22, 'auto', { ...opts, flash: 0.5 }).flash).toBe(0);
  });
});

describe('environmentFor: morning mist (FE-11)', () => {
  const mist = (w: 'clear' | 'overcast' | 'rain', h: number): number => environmentFor(w, h, 'auto', opts).mist;

  it('lies over the hub at dawn in clear and overcast weather and lifts by 09:30', () => {
    expect(mist('clear', 6)).toBeGreaterThan(0.5);
    expect(mist('overcast', 7)).toBeGreaterThan(0.5);
    expect(mist('clear', 8)).toBeGreaterThan(0.3);
    expect(mist('clear', 9)).toBeGreaterThan(0);
    expect(mist('clear', 9)).toBeLessThan(mist('clear', 8.5));
    expect(mist('clear', 9.6)).toBe(0);
    expect(mist('clear', 14)).toBe(0);
    expect(mist('clear', 3)).toBe(0);
  });

  it('only shows in clear and overcast weather', () => {
    expect(mist('rain', 7)).toBe(0);
    expect(environmentFor('heatwave', 7, 'auto', opts).mist).toBe(0);
  });

  it('follows the forced time of day', () => {
    expect(environmentFor('clear', 7, 'day', opts).mist).toBe(0);
  });
});

describe('environmentFor: wind (FE-13)', () => {
  it('carries a wind in range', () => {
    const w = environmentFor('clear', 15, 'auto', { ...opts, tSec: 42 }).wind;
    expect(w.strength).toBeGreaterThanOrEqual(0);
    expect(w.strength).toBeLessThanOrEqual(1);
    expect(w.gust).toBeGreaterThanOrEqual(0);
    expect(w.gust).toBeLessThanOrEqual(1);
  });
});
