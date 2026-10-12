import { describe, expect, it } from 'vitest';
import { createQualityController, settingsFor } from '../../../src/render/quality';

const feed = (q: ReturnType<typeof createQualityController>, frameSec: number, seconds: number): number => {
  let tier = q.tier;
  for (let t = 0; t < seconds - 1e-9; t += frameSec) tier = q.sample(frameSec);
  return tier;
};

describe('settingsFor (N-2)', () => {
  it('lowers pixel ratio, shadows and effects by tier', () => {
    expect(settingsFor(0)).toEqual({ pixelRatioCap: 2, shadowMapSize: 2048, shimmer: true, bloom: true, clouds: true, lampPoolFraction: 1 });
    expect(settingsFor(1)).toEqual({ pixelRatioCap: 1.5, shadowMapSize: 1024, shimmer: false, bloom: false, clouds: true, lampPoolFraction: 1 });
    expect(settingsFor(2)).toEqual({ pixelRatioCap: 1, shadowMapSize: 0, shimmer: false, bloom: false, clouds: false, lampPoolFraction: 0.5 });
  });
});

describe('createQualityController (N-2)', () => {
  it('starts on tier 0 on desktop and tier 1 on touch devices', () => {
    expect(createQualityController({ touch: false }).tier).toBe(0);
    expect(createQualityController({ touch: true }).tier).toBe(1);
  });

  it('steps down one tier per slow window, never below tier 2', () => {
    const q = createQualityController({ touch: false });
    expect(feed(q, 0.04, 2)).toBe(1);
    expect(feed(q, 0.04, 2)).toBe(2);
    expect(feed(q, 0.04, 4)).toBe(2);
  });

  it('steps back up on fast windows, never above tier 0', () => {
    const q = createQualityController({ touch: true });
    expect(feed(q, 0.008, 2)).toBe(0);
    expect(feed(q, 0.008, 4)).toBe(0);
  });

  it('holds steady in between, and ignores bad samples', () => {
    const q = createQualityController({ touch: true });
    expect(feed(q, 0.016, 6)).toBe(1);
    expect(q.sample(Number.NaN)).toBe(1);
    expect(q.sample(-1)).toBe(1);
  });
});
