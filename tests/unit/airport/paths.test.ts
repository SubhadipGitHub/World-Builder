import { describe, expect, it } from 'vitest';
import { pointAtDistance, polylineLength, sampleKeyframes, type Keyframe } from '../../../src/airport/paths';

// Architecture §19, H1/H3.

describe('sampleKeyframes', () => {
  const keys: Keyframe[] = [
    { t: 0, x: 0, y: 0, z: 0 },
    { t: 10, x: 100, y: 0, z: 0 },
    { t: 20, x: 100, y: 0, z: 50 },
    { t: 30, x: 100, y: 0, z: 50 },
  ];

  it('interpolates linearly and reports heading and speed of the current segment', () => {
    const a = sampleKeyframes(keys, 5);
    expect(a).toMatchObject({ x: 50, y: 0, z: 0 });
    expect(a.heading).toBeCloseTo(0, 9);
    expect(a.speed).toBeCloseTo(10, 9);
    const b = sampleKeyframes(keys, 15);
    expect(b.z).toBeCloseTo(25, 9);
    expect(b.heading).toBeCloseTo(Math.PI / 2, 9);
    expect(b.speed).toBeCloseTo(5, 9);
  });

  it('keeps the last heading with zero speed while holding still, and clamps outside the range', () => {
    const hold = sampleKeyframes(keys, 25);
    expect(hold).toMatchObject({ x: 100, z: 50, speed: 0 });
    expect(hold.heading).toBeCloseTo(Math.PI / 2, 9);
    expect(sampleKeyframes(keys, -5)).toMatchObject({ x: 0, z: 0 });
    expect(sampleKeyframes(keys, 99)).toMatchObject({ x: 100, z: 50, speed: 0 });
  });

  it('derives pitch from the climb', () => {
    const climb: Keyframe[] = [
      { t: 0, x: 0, y: 0, z: 0 },
      { t: 10, x: 100, y: 100, z: 0 },
    ];
    expect(sampleKeyframes(climb, 5).pitch).toBeCloseTo(Math.PI / 4, 9);
  });

  it('throws on an empty list', () => {
    expect(() => sampleKeyframes([], 0)).toThrow();
  });
});

describe('polylines', () => {
  const square = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ];

  it('measures open and closed lengths', () => {
    expect(polylineLength(square)).toBe(30);
    expect(polylineLength(square, true)).toBe(40);
  });

  it('finds points by distance, clamping when open and wrapping when closed', () => {
    expect(pointAtDistance(square, 15)).toMatchObject({ x: 10, z: 5 });
    expect(pointAtDistance(square, 15).heading).toBeCloseTo(Math.PI / 2, 9);
    expect(pointAtDistance(square, 99)).toMatchObject({ x: 0, z: 10 });
    expect(pointAtDistance(square, 45, true)).toMatchObject({ x: 5, z: 0 });
    expect(pointAtDistance(square, -5, true)).toMatchObject({ x: 0, z: 5 });
  });
});
