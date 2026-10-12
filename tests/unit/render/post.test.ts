import { describe, expect, it } from 'vitest';
import { postEffectsFor } from '../../../src/render/post';

describe('postEffectsFor (P6, V-7)', () => {
  it('blooms at night on the top tier only', () => {
    expect(postEffectsFor({ nightFactor: 1, qualityTier: 0, shimmer: false })).toEqual(['bloom']);
    expect(postEffectsFor({ nightFactor: 1, qualityTier: 1, shimmer: false })).toEqual([]);
    expect(postEffectsFor({ nightFactor: 1, qualityTier: 2, shimmer: false })).toEqual([]);
    expect(postEffectsFor({ nightFactor: 0.04, qualityTier: 0, shimmer: false })).toEqual([]);
    expect(postEffectsFor({ nightFactor: 0.06, qualityTier: 0, shimmer: false })).toEqual(['bloom']);
  });

  it('adds shimmer when asked, after bloom', () => {
    expect(postEffectsFor({ nightFactor: 0, qualityTier: 0, shimmer: true })).toEqual(['shimmer']);
    expect(postEffectsFor({ nightFactor: 1, qualityTier: 0, shimmer: true })).toEqual(['bloom', 'shimmer']);
  });

  it('renders plainly with nothing to do', () => {
    expect(postEffectsFor({ nightFactor: 0, qualityTier: 0, shimmer: false })).toEqual([]);
  });
});
