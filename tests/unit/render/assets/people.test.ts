import { describe, expect, it } from 'vitest';
import { dimensions } from '../../../../src/config/facility';
import { personAsset, walkBob } from '../../../../src/render/assets/people';
import { triangleCount } from '../../../../src/render/kit/assemble';
import { colours, extent } from '../kit/helpers';

describe('personAsset (V-5, P10)', () => {
  for (const role of ['customer', 'staff'] as const) {
    it(`${role} fits the pedestrian footprint, stands 1.5–1.9 m tall, within budget`, () => {
      const a = personAsset(role);
      const e = extent(a.clothing, a.skin);
      const max = dimensions.pedestrian.length * 1.05;
      expect(e.size.x).toBeLessThanOrEqual(max);
      expect(e.size.z).toBeLessThanOrEqual(max);
      expect(e.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(e.min.y).toBeLessThanOrEqual(0.02);
      expect(e.size.y).toBeGreaterThanOrEqual(1.5);
      expect(e.size.y).toBeLessThanOrEqual(1.9);
      expect(a.skin.getAttribute('color').count).toBeGreaterThan(0);
      expect(triangleCount(a.clothing) + triangleCount(a.skin)).toBeLessThanOrEqual(800);
    });
  }

  it('dresses staff in a gold hi-vis vest and customers in tintable white', () => {
    const vest = colours(personAsset('staff').clothing).some(([r, g, b]) => r > 0.8 && g > 0.4 && b < 0.3);
    expect(vest).toBe(true);
    for (const c of colours(personAsset('customer').clothing)) expect(c).toEqual([1, 1, 1]);
  });
});

describe('walkBob (V-5)', () => {
  it('is still when standing', () => {
    expect(walkBob(1.3, 0, 0)).toEqual({ lift: 0, sway: 0 });
    expect(walkBob(1.3, 0.05, 0)).toEqual({ lift: 0, sway: 0 });
  });

  it('bounces within bounds and grows with speed', () => {
    const maxLift = (speed: number): number => {
      let m = 0;
      for (let t = 0; t < 3; t += 0.01) {
        const p = walkBob(t, speed, 0.3);
        expect(p.lift).toBeGreaterThanOrEqual(0);
        expect(p.lift).toBeLessThanOrEqual(0.06);
        expect(Math.abs(p.sway)).toBeLessThanOrEqual(0.08);
        m = Math.max(m, p.lift);
      }
      return m;
    };
    expect(maxLift(1.4)).toBeGreaterThan(maxLift(0.6));
    expect(maxLift(0.6)).toBeGreaterThan(0);
  });

  it('varies over time and with phase', () => {
    expect(walkBob(0.1, 1.4, 0)).not.toEqual(walkBob(0.3, 1.4, 0));
    expect(walkBob(0.1, 1.4, 0)).not.toEqual(walkBob(0.1, 1.4, 1));
  });
});
