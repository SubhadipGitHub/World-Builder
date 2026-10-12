import { describe, expect, it } from 'vitest';
import { blob, capsule, cylinder, lathe, roundedBox, slab } from '../../../../src/render/kit/shapes';
import { extent } from './helpers';

describe('shape kit (V-1, P3)', () => {
  it('builds a rounded box with the exact outer size, centred, non-indexed, with normals', () => {
    const g = roundedBox(2, 1, 3, 0.2);
    const e = extent(g);
    expect(e.size.x).toBeCloseTo(2, 5);
    expect(e.size.y).toBeCloseTo(1, 5);
    expect(e.size.z).toBeCloseTo(3, 5);
    expect(e.center.length()).toBeCloseTo(0, 5);
    expect(g.index).toBeNull();
    expect(g.getAttribute('normal')).toBeDefined();
    expect(g.getAttribute('position').count).toBeGreaterThan(36);
  });

  it('clamps an over-large corner radius instead of breaking', () => {
    const e = extent(roundedBox(2, 0.2, 3, 5));
    expect(e.size.y).toBeCloseTo(0.2, 5);
    expect(Number.isFinite(e.size.x)).toBe(true);
  });

  it('builds a capsule whose height is length + 2 × radius', () => {
    const e = extent(capsule(0.3, 1));
    expect(e.size.y).toBeCloseTo(1.6, 3);
    expect(e.size.x).toBeLessThanOrEqual(0.6 + 1e-6);
    expect(e.size.x).toBeGreaterThan(0.55);
  });

  it('builds cylinders, lathes and blobs of the right size', () => {
    expect(extent(cylinder(0.5, 0.5, 2)).size.y).toBeCloseTo(2, 5);
    const l = extent(
      lathe([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 2 },
        { x: 0, z: 2 },
      ]),
    );
    expect(l.size.y).toBeCloseTo(2, 5);
    expect(l.size.x).toBeGreaterThan(1.9);
    expect(l.size.x).toBeLessThanOrEqual(2 + 1e-6);
    const b = extent(blob(1)).size;
    for (const v of [b.x, b.y, b.z]) {
      expect(v).toBeGreaterThan(1.8);
      expect(v).toBeLessThanOrEqual(2 + 1e-6);
    }
  });

  it('always returns non-indexed geometry with normals', () => {
    for (const g of [capsule(0.2, 0.5), cylinder(0.2, 0.3, 1), blob(0.5)]) {
      expect(g.index).toBeNull();
      expect(g.getAttribute('normal').count).toBe(g.getAttribute('position').count);
    }
  });
});

describe('slab (decals and thin panels)', () => {
  it('is a plain 12-triangle box of exactly w × h × d with normals', () => {
    const g = slab(0.3, 0.16, 0.012);
    const e = extent(g);
    expect(e.size.x).toBeCloseTo(0.3, 6);
    expect(e.size.y).toBeCloseTo(0.16, 6);
    expect(e.size.z).toBeCloseTo(0.012, 6);
    expect(g.getAttribute('position').count).toBe(36);
    expect(g.hasAttribute('normal')).toBe(true);
    expect(g.hasAttribute('uv')).toBe(false);
  });
});

