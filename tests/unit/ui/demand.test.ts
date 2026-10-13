import { describe, expect, it } from 'vitest';
import { demandText } from '../../../src/ui/demand';

describe('demandText (R-7, K9)', () => {
  it('shows the factor to one decimal and the period', () => {
    expect(demandText({ factor: 1.6, period: 'Morning peak' })).toBe('Demand ×1.6 · Morning peak');
    expect(demandText({ factor: 1, period: 'Midday' })).toBe('Demand ×1.0 · Midday');
    expect(demandText({ factor: 0.2049, period: 'Overnight' })).toBe('Demand ×0.2 · Overnight');
    expect(demandText({ factor: 2.52, period: 'Evening peak' })).toBe('Demand ×2.5 · Evening peak');
  });
});
