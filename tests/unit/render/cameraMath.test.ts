import { describe, expect, it } from 'vitest';
import {
  clampState,
  easeInOutCubic,
  followTarget,
  glideDuration,
  startGlide,
  stepGlide,
  type CameraLimits,
  type CameraState,
} from '../../../src/render/cameraMath';

const limits: CameraLimits = { minX: -100, maxX: 100, minZ: -50, maxZ: 50, minDistance: 20, maxDistance: 400, minPolar: 0.35, maxPolar: 1.25 };
const at = (x: number, z: number, extra: Partial<CameraState> = {}): CameraState => ({ target: { x, z }, distance: 100, azimuth: 0.8, polar: 0.9, ...extra });

describe('clampState (I-1)', () => {
  it('leaves a valid state untouched', () => {
    const s = at(10, 10);
    expect(clampState(s, limits)).toEqual(s);
  });

  it('clamps target, distance and polar angle', () => {
    const s = clampState(at(500, -90, { distance: 5_000, polar: 2 }), limits);
    expect(s.target).toEqual({ x: 100, z: -50 });
    expect(s.distance).toBe(400);
    expect(s.polar).toBe(1.25);
    expect(clampState(at(0, 0, { distance: 1, polar: 0 }), limits)).toMatchObject({ distance: 20, polar: 0.35 });
  });
});

describe('easeInOutCubic', () => {
  it('maps the ends and midpoint, clamps, and is symmetric and monotonic', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(v + easeInOutCubic(1 - t)).toBeCloseTo(1);
      prev = v;
    }
  });
});

describe('glides (I-2, I-5)', () => {
  it('moves partway, then lands exactly on the destination and ends', () => {
    const from = at(0, 0);
    const to = at(80, 40, { distance: 60 });
    let g = startGlide(from, to, 1);
    const mid = stepGlide(g, 0.5);
    expect(mid.glide).not.toBeNull();
    expect(mid.state.target.x).toBeGreaterThan(0);
    expect(mid.state.target.x).toBeLessThan(80);
    g = mid.glide!;
    const end = stepGlide(g, 0.6);
    expect(end.glide).toBeNull();
    expect(end.state).toEqual(to);
  });

  it('finishes a zero-length glide immediately (reduced motion)', () => {
    const r = stepGlide(startGlide(at(0, 0), at(50, 0), 0), 0.016);
    expect(r.glide).toBeNull();
    expect(r.state.target.x).toBe(50);
  });

  it('turns the short way round', () => {
    const from = at(0, 0, { azimuth: 3.0 });
    const to = at(0, 0, { azimuth: -3.0 });
    const mid = stepGlide(startGlide(from, to, 1), 0.5).state;
    expect(Math.abs(Math.cos(mid.azimuth) - Math.cos(Math.PI))).toBeLessThan(0.05);
  });
});

describe('followTarget (I-2 follow)', () => {
  it('closes in on a point without overshooting and keeps the framing', () => {
    let s = at(0, 0);
    let prevDist = Infinity;
    for (let i = 0; i < 300; i++) {
      s = followTarget(s, { x: 30, z: -20 }, 1 / 60, 4);
      const d = Math.hypot(s.target.x - 30, s.target.z + 20);
      expect(d).toBeLessThanOrEqual(prevDist + 1e-9);
      expect(s.target.x).toBeLessThanOrEqual(30 + 1e-9);
      prevDist = d;
    }
    expect(prevDist).toBeLessThan(0.01);
    expect(s).toMatchObject({ distance: 100, azimuth: 0.8, polar: 0.9 });
  });
});

describe('glideDuration (N-5)', () => {
  it('is 0 with reduced motion, otherwise grows with distance within [0.6, 2.0]', () => {
    expect(glideDuration(at(0, 0), at(300, 0), true)).toBe(0);
    expect(glideDuration(at(0, 0), at(1, 0), false)).toBe(0.6);
    expect(glideDuration(at(0, 0), at(5_000, 0), false)).toBe(2.0);
    expect(glideDuration(at(0, 0), at(150, 0), false)).toBeGreaterThan(glideDuration(at(0, 0), at(40, 0), false));
  });
});
