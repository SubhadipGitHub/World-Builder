import { describe, expect, it } from 'vitest';
import { createPath } from '../../../../src/sim/graph/path';

describe('createPath', () => {
  it('measures a straight segment', () => {
    const p = createPath([{ x: 0, z: 0 }, { x: 3, z: 4 }]);
    expect(p.length).toBeCloseTo(5);
  });

  it('measures a polyline as the sum of its segments', () => {
    const p = createPath([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    expect(p.length).toBeCloseTo(15);
  });

  it('pointAt interpolates by arc length across segments', () => {
    const p = createPath([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    expect(p.pointAt(0)).toEqual({ x: 0, z: 0 });
    const mid = p.pointAt(5);
    expect(mid.x).toBeCloseTo(5);
    expect(mid.z).toBeCloseTo(0);
    const corner = p.pointAt(12);
    expect(corner.x).toBeCloseTo(10);
    expect(corner.z).toBeCloseTo(2);
    const end = p.pointAt(15);
    expect(end.x).toBeCloseTo(10);
    expect(end.z).toBeCloseTo(5);
  });

  it('clamps pointAt outside [0, length]', () => {
    const p = createPath([{ x: 0, z: 0 }, { x: 10, z: 0 }]);
    expect(p.pointAt(-4).x).toBeCloseTo(0);
    expect(p.pointAt(99).x).toBeCloseTo(10);
  });

  it('headingAt uses atan2(dz, dx) of the segment containing s', () => {
    const p = createPath([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    expect(p.headingAt(2)).toBeCloseTo(0);
    expect(p.headingAt(13)).toBeCloseTo(Math.PI / 2);
    const west = createPath([{ x: 0, z: 0 }, { x: -1, z: 0 }]);
    expect(Math.abs(west.headingAt(0.5))).toBeCloseTo(Math.PI);
  });

  it('rejects fewer than two points and zero-length paths', () => {
    expect(() => createPath([{ x: 1, z: 1 }])).toThrow();
    expect(() => createPath([{ x: 1, z: 1 }, { x: 1, z: 1 }])).toThrow();
  });
});
