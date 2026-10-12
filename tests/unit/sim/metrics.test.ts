import { describe, expect, it } from 'vitest';
import { averageReadyEvSoc, averageTurnaroundMin, trend, utilisation } from '../../../src/sim/metrics';

describe('utilisation (KPI 2, D8)', () => {
  it('is on rent ÷ total fleet', () => {
    expect(utilisation(78, 120)).toBeCloseTo(0.65);
    expect(utilisation(0, 120)).toBe(0);
    expect(utilisation(120, 120)).toBe(1);
  });

  it('rejects a non-positive fleet', () => {
    expect(() => utilisation(1, 0)).toThrow();
  });
});

describe('averageTurnaroundMin (KPI 1)', () => {
  it('averages returned→staged minutes for records staged inside the window', () => {
    const records = [
      { returnedAt: 0, stagedAt: 3_000 }, // outside a 1 h window ending at 7 200 (staged at 3 000)
      { returnedAt: 3_600, stagedAt: 6_000 }, // 40 min
      { returnedAt: 4_200, stagedAt: 7_200 }, // 50 min
    ];
    expect(averageTurnaroundMin(records, 7_200, 3_600)).toBeCloseTo(45);
  });

  it('is null with no records in the window', () => {
    expect(averageTurnaroundMin([], 100, 3_600)).toBeNull();
    expect(averageTurnaroundMin([{ returnedAt: 0, stagedAt: 10 }], 10_000, 3_600)).toBeNull();
  });
});

describe('averageReadyEvSoc (KPI 3)', () => {
  it('averages only staged EVs', () => {
    expect(
      averageReadyEvSoc([
        { cls: 'ev', state: 'staged', socPct: 80 },
        { cls: 'ev', state: 'staged', socPct: 90 },
        { cls: 'ev', state: 'energising', socPct: 40 },
        { cls: 'sedan', state: 'staged', socPct: null },
      ]),
    ).toBeCloseTo(85);
  });

  it('is null with no staged EVs', () => {
    expect(averageReadyEvSoc([{ cls: 'suv', state: 'staged', socPct: null }])).toBeNull();
  });
});

describe('trend', () => {
  it('reports up, down or flat within epsilon', () => {
    expect(trend(10, 12, 0.5)).toBe('up');
    expect(trend(12, 10, 0.5)).toBe('down');
    expect(trend(10, 10.4, 0.5)).toBe('flat');
    expect(trend(null, 10, 0.5)).toBe('flat');
    expect(trend(10, null, 0.5)).toBe('flat');
  });
});
