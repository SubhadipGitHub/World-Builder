import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brand } from '../../../src/config/brand';
import { contrastRatio } from '../../../src/shared/color';

// N-7: real rental, car-maker, airport and loyalty names must never ship.
const BANNED = [
  'hertz', 'avis', 'sixt', 'alamo', 'dollar thrifty', 'national car rental',
  'tesla', 'model y', 'chevrolet', 'chevy', 'tahoe', 'toyota', 'camry',
  'lax', 'los angeles international', "president's circle", 'gold plus',
  'rapid return', '#ffc72c',
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

describe('brand config (D5, N-7)', () => {
  it('is the fictional GoldLane brand', () => {
    expect(brand.company).toBe('GoldLane Rentals');
    expect(brand.tiers).toEqual(['Gold', 'Platinum']);
  });

  it('contains no real brand names anywhere in src/', () => {
    for (const file of filesUnder('src')) {
      const text = readFileSync(file, 'utf8').toLowerCase();
      for (const word of BANNED) {
        const pattern = new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\#']/g, '\\$&')}([^a-z]|$)`);
        expect(pattern.test(text), `"${word}" found in ${file}`).toBe(false);
      }
    }
  });
});

describe('palette contrast (N-5)', () => {
  const { accent, dark, light } = brand.colors;

  it('body text passes AA (4.5:1) in both themes', () => {
    expect(contrastRatio(dark.text, dark.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.text, light.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('gold passes AA as text on graphite, and dark text passes on gold', () => {
    expect(contrastRatio(accent, dark.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.text, accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('gold fails AA on the light background, which is why light mode uses it for fills only', () => {
    expect(contrastRatio(accent, light.bg)).toBeLessThan(4.5);
  });
});
