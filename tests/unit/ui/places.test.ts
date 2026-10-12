import { describe, expect, it } from 'vitest';
import { FACILITIES } from '../../../src/ui/facilities';
import { PLACES } from '../../../src/ui/places';

describe('PLACES (L-1, H11)', () => {
  it('names every airport place once', () => {
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
    expect(PLACES.map((p) => p.name)).toContain('Runway 09/27');
  });

  it('ranks every place below every hub facility', () => {
    const lowestHub = Math.min(...FACILITIES.map((f) => f.priority));
    for (const p of PLACES) expect(p.priority).toBeLessThan(lowestHub);
  });
});
