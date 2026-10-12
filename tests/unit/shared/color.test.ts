import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../../src/shared/color';

describe('contrastRatio (WCAG 2.x)', () => {
  it('gives the reference extremes', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('is symmetric and case-insensitive', () => {
    expect(contrastRatio('#f2b33d', '#1E1E24')).toBeCloseTo(contrastRatio('#1E1E24', '#F2B33D'), 10);
  });

  it('rejects malformed colours', () => {
    expect(() => contrastRatio('F2B33D', '#000000')).toThrow();
    expect(() => contrastRatio('#FFF', '#000000')).toThrow();
    expect(() => contrastRatio('#GGGGGG', '#000000')).toThrow();
  });
});
