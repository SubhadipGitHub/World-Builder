import { describe, expect, it } from 'vitest';
import { brand } from '../../../../src/config/brand';
import { dimensions } from '../../../../src/config/facility';
import { vehicleAsset, type VehicleAssetKind } from '../../../../src/render/assets/vehicles';
import { triangleCount } from '../../../../src/render/kit/assemble';
import { darkPalette } from '../../../../src/render/palette';
import { colours, extent, positions, rgb } from '../kit/helpers';

const HEIGHTS: Readonly<Record<VehicleAssetKind, readonly [number, number]>> = {
  sedan: [1.25, 1.7],
  suv: [1.6, 2.1],
  ev: [1.4, 1.8],
  // M9 classes (FE-10).
  economy: [1.25, 1.65],
  luxury: [1.15, 1.55],
  minivan: [1.75, 2.15],
  pickup: [1.65, 2.1],
  shuttle: [2.6, 3.4],
  tow: [2.2, 3.0],
  van: [1.9, 2.6],
  cart: [1.6, 2.3],
};
const KINDS = Object.keys(HEIGHTS) as VehicleAssetKind[];

describe('vehicleAsset: footprint fidelity (P10, L-4)', () => {
  for (const kind of KINDS) {
    it(`${kind} fits its simulation footprint and stands on the ground`, () => {
      const a = vehicleAsset(kind, darkPalette);
      const e = extent(a.paint, a.trim, a.lamps);
      const { length: l, width: w } = dimensions[kind];
      expect(e.size.x).toBeGreaterThanOrEqual(0.95 * l);
      expect(e.size.x).toBeLessThanOrEqual(1.05 * l);
      expect(Math.abs(e.center.x)).toBeLessThanOrEqual(0.05 * l);
      expect(e.size.z).toBeGreaterThanOrEqual(0.85 * w);
      expect(e.size.z).toBeLessThanOrEqual(1.05 * w);
      expect(Math.abs(e.center.z)).toBeLessThanOrEqual(0.05 * w);
      expect(e.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(e.min.y).toBeLessThanOrEqual(0.06);
      expect(e.size.y).toBeGreaterThanOrEqual(HEIGHTS[kind][0]);
      expect(e.size.y).toBeLessThanOrEqual(HEIGHTS[kind][1]);
    });
  }
});

describe('vehicleAsset: parts (V-2, P2)', () => {
  for (const kind of KINDS) {
    it(`${kind} has coloured paint, trim and lamps within the triangle budget`, () => {
      const a = vehicleAsset(kind, darkPalette);
      for (const part of [a.paint, a.trim, a.lamps]) expect(part.getAttribute('color').count).toBeGreaterThan(0);
      expect(triangleCount(a.paint) + triangleCount(a.trim) + triangleCount(a.lamps)).toBeLessThanOrEqual(2500);
    });

    it(`${kind} has warm headlights at the front and red taillights at the back`, () => {
      const lamps = vehicleAsset(kind, darkPalette).lamps;
      const ps = positions(lamps);
      const cs = colours(lamps);
      const front = ps.filter((_, i) => (cs[i]?.[1] ?? 0) > 0.55);
      const back = ps.filter((_, i) => (cs[i]?.[0] ?? 0) > 0.5 && (cs[i]?.[1] ?? 1) < 0.3);
      expect(front.length).toBeGreaterThan(0);
      expect(back.length).toBeGreaterThan(0);
      const meanX = (pts: [number, number, number][]): number => pts.reduce((s, p) => s + p[0], 0) / pts.length;
      expect(meanX(front)).toBeGreaterThan(0);
      expect(meanX(back)).toBeLessThan(0);
    });
  }

  it('paints fleet bodies white so each car takes its own instance colour', () => {
    for (const kind of ['economy', 'sedan', 'luxury', 'suv', 'minivan', 'pickup', 'ev'] as const) {
      for (const c of colours(vehicleAsset(kind, darkPalette).paint)) expect(c).toEqual([1, 1, 1]);
    }
  });

  it('gives each fleet class a distinct silhouette', () => {
    const h = (k: VehicleAssetKind) => {
      const a = vehicleAsset(k, darkPalette);
      return extent(a.paint, a.trim, a.lamps).size.y;
    };
    expect(h('suv') - h('sedan')).toBeGreaterThanOrEqual(0.15);
    expect(Math.abs(h('ev') - h('sedan'))).toBeGreaterThanOrEqual(0.05);
  });

  it('tells the M9 classes apart from above and from the side (FE-10)', () => {
    const e = (k: VehicleAssetKind) => {
      const a = vehicleAsset(k, darkPalette);
      return extent(a.paint, a.trim, a.lamps).size;
    };
    // Minivan and pickup stand clearly taller than a sedan; the premium saloon sits lowest.
    expect(e('minivan').y - e('sedan').y).toBeGreaterThanOrEqual(0.25);
    expect(e('pickup').y - e('sedan').y).toBeGreaterThanOrEqual(0.2);
    expect(e('luxury').y).toBeLessThanOrEqual(e('sedan').y);
    // The economy hatch is the shortest car; the pickup the longest.
    expect(e('economy').x).toBeLessThan(e('sedan').x - 0.4);
    expect(e('pickup').x).toBeGreaterThan(e('suv').x);
  });

  it('gives the pickup an open bed: no paint above the bed sides behind the cab (FE-10)', () => {
    const a = vehicleAsset('pickup', darkPalette);
    const top = extent(a.paint).max.y;
    const rear = positions(a.paint).filter((p) => p[0] < -0.25 * dimensions.pickup.length);
    expect(rear.length).toBeGreaterThan(0);
    for (const p of rear) expect(p[1]).toBeLessThan(0.75 * top);
  });
});

describe('vehicleAsset: fleet livery (B-4, G11)', () => {
  const gold = rgb(brand.colors.accent);
  const isGold = (c: [number, number, number]): boolean => c.every((v, i) => Math.abs(v - (gold[i] ?? 0)) < 1e-3);

  for (const kind of ['economy', 'sedan', 'luxury', 'suv', 'minivan', 'pickup', 'ev'] as const) {
    it(`${kind} carries a gold GoldLane stripe on both sides, in the untinted trim`, () => {
      const a = vehicleAsset(kind, darkPalette);
      const ps = positions(a.trim);
      const goldPts = colours(a.trim)
        .map((c, i) => (isGold(c) ? ps[i] : undefined))
        .filter((p): p is [number, number, number] => p !== undefined);
      const halfW = dimensions[kind].width / 2;
      expect(goldPts.some((p) => p[2] > 0.8 * halfW)).toBe(true);
      expect(goldPts.some((p) => p[2] < -0.8 * halfW)).toBe(true);
      // Door height, not roof or wheels.
      for (const p of goldPts) {
        expect(p[1]).toBeGreaterThan(0.3);
        expect(p[1]).toBeLessThan(1.3);
      }
      expect(colours(a.paint).some(isGold)).toBe(false);
    });
  }
});
