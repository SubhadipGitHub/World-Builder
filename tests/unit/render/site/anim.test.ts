import { describe, expect, it } from 'vitest';
import type { Boom } from '../../../../src/layout/site';
import { BOOM_APPROACH_M, BOOM_PAST_M, PATROL_SPEED, boomTarget, cctvPan, flagWave, patrolPose, siteDetail } from '../../../../src/render/site/anim';

// Architecture §18, G5 and G10.

describe('boomTarget (SEC-2)', () => {
  // Traffic drives east (+x) through a boom at x = 0 on the road z = 0.
  const boom: Boom = { id: 'entry', pivot: { x: 0, z: 3 }, heading: 0, length: 3.5 };
  const car = (x: number, z = 0) => ({ x, z, kind: 'fleet' });

  it('lifts for a vehicle approaching or just past', () => {
    expect(boomTarget([car(-BOOM_APPROACH_M + 1)], boom)).toBe(true);
    expect(boomTarget([car(BOOM_PAST_M - 1)], boom)).toBe(true);
  });

  it('stays down with nobody near, far behind, well past, or off the lane', () => {
    expect(boomTarget([], boom)).toBe(false);
    expect(boomTarget([car(-BOOM_APPROACH_M - 2)], boom)).toBe(false);
    expect(boomTarget([car(BOOM_PAST_M + 2)], boom)).toBe(false);
    expect(boomTarget([car(-3, 12)], boom)).toBe(false);
  });

  it('ignores pedestrians', () => {
    expect(boomTarget([{ x: -2, z: 0, kind: 'pedestrian' }], boom)).toBe(false);
  });
});

describe('flagWave (B-2)', () => {
  it('is zero at the pole and bounded towards the free edge', () => {
    for (let t = 0; t < 10; t += 0.37) {
      expect(flagWave(t, 0, 0.5, 1)).toBeCloseTo(0, 9);
      for (const u of [0.25, 0.5, 1]) expect(Math.abs(flagWave(t, u, 0.3, 1))).toBeLessThanOrEqual(0.35 * u + 1e-9);
    }
  });

  it('moves over time, and not at all at rate 0', () => {
    expect(flagWave(0, 1, 0.5, 1)).not.toBeCloseTo(flagWave(0.4, 1, 0.5, 1), 3);
    for (let t = 0; t < 5; t += 0.5) expect(flagWave(t, 1, 0.5, 0)).toBe(0);
  });
});

describe('patrolPose (SEC-4)', () => {
  const square = [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 100 },
    { x: 0, z: 100 },
  ];

  it('moves at PATROL_SPEED along the loop and faces its direction', () => {
    const a = patrolPose(square, 1);
    expect(a.x).toBeCloseTo(PATROL_SPEED, 6);
    expect(a.z).toBeCloseTo(0, 6);
    expect(a.heading).toBeCloseTo(0, 6);
    const b = patrolPose(square, (100 + 30) / PATROL_SPEED);
    expect(b.x).toBeCloseTo(100, 6);
    expect(b.z).toBeCloseTo(30, 6);
    expect(b.heading).toBeCloseTo(Math.PI / 2, 6);
  });

  it('wraps around the closed loop and stays continuous', () => {
    const lap = 400 / PATROL_SPEED;
    const p = patrolPose(square, lap + 1);
    expect(p.x).toBeCloseTo(PATROL_SPEED, 6);
    let prev = patrolPose(square, 0);
    for (let t = 0.1; t < 2 * lap; t += 0.1) {
      const q = patrolPose(square, t);
      expect(Math.hypot(q.x - prev.x, q.z - prev.z)).toBeLessThanOrEqual(PATROL_SPEED * 0.1 + 1e-6);
      prev = q;
    }
  });
});

describe('cctvPan (SEC-3)', () => {
  it('pans within ±0.6 rad, differently per camera, and holds still without motion', () => {
    const values = Array.from({ length: 40 }, (_, k) => cctvPan(k * 0.5, 0, true));
    for (const v of values) expect(Math.abs(v)).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.3);
    expect(cctvPan(3, 0, true)).not.toBeCloseTo(cctvPan(3, 1, true), 3);
    expect(cctvPan(3, 2, false)).toBe(0);
  });
});

describe('siteDetail (D21, §10.4)', () => {
  it('shows everything on tier 0', () => {
    expect(siteDetail(0, false)).toEqual({ flagRate: 1, cctvMotion: true, patrol: true, clutter: true });
  });

  it('halves flags and stills cameras on tier 1', () => {
    expect(siteDetail(1, false)).toEqual({ flagRate: 0.5, cctvMotion: false, patrol: true, clutter: true });
  });

  it('drops motion, the patrol car and clutter on tier 2', () => {
    expect(siteDetail(2, false)).toEqual({ flagRate: 0, cctvMotion: false, patrol: false, clutter: false });
  });

  it('stills flags and cameras with reduced motion on any tier', () => {
    expect(siteDetail(0, true)).toEqual({ flagRate: 0, cctvMotion: false, patrol: true, clutter: true });
  });
});
