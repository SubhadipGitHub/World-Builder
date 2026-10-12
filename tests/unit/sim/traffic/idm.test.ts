import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advance, idmAcceleration, type IdmParams, type MotionState } from '../../../../src/sim/traffic/idm';

const p: IdmParams = { v0: 6.7, a: 1.2, b: 2.0, T: 1.2, s0: 1.5, delta: 4 };
const DT = 0.05;

describe('idmAcceleration', () => {
  it('equals a when stationary on a free road', () => {
    expect(idmAcceleration(0, Infinity, 0, p)).toBeCloseTo(p.a);
  });

  it('is ~0 at desired speed on a free road', () => {
    expect(idmAcceleration(p.v0, Infinity, 0, p)).toBeCloseTo(0, 5);
  });

  it('brakes when closing on a slower leader', () => {
    expect(idmAcceleration(6, 5, 6, p)).toBeLessThan(0);
  });

  it('brakes harder the closer the obstacle is', () => {
    expect(idmAcceleration(5, 4, 5, p)).toBeLessThan(idmAcceleration(5, 20, 5, p));
  });
});

describe('advance (architecture §4.2)', () => {
  it('accelerates towards v0 on a free road and never exceeds it', () => {
    let st: MotionState = { s: 0, v: 0 };
    for (let i = 0; i < 1_200; i++) {
      st = advance(st, null, p, DT);
      expect(st.v).toBeLessThanOrEqual(p.v0 + 1e-9);
    }
    expect(st.v).toBeGreaterThan(p.v0 * 0.97);
    expect(st.s).toBeGreaterThan(0);
  });

  it('stops behind a stationary obstacle, no closer than s0 and not absurdly far', () => {
    const obstacleAt = 40;
    let st: MotionState = { s: 0, v: 5 };
    for (let i = 0; i < 2_000; i++) {
      const gap = obstacleAt - st.s;
      st = advance(st, { gap, speed: 0 }, p, DT);
      expect(obstacleAt - st.s).toBeGreaterThanOrEqual(p.s0 - 1e-9);
    }
    expect(st.v).toBeCloseTo(0, 2);
    expect(obstacleAt - st.s).toBeLessThan(p.s0 + 1.0);
  });

  it('does not move when the gap is already below s0', () => {
    const st = advance({ s: 10, v: 3 }, { gap: 1.0, speed: 0 }, p, DT);
    expect(st.s).toBe(10);
    expect(st.v).toBe(0);
  });

  it('hard-clamps an overshoot: a fast mover never eats into s0 even with a tiny gap', () => {
    const st = advance({ s: 0, v: 20 }, { gap: 3, speed: 0 }, p, DT);
    expect(st.s).toBeLessThanOrEqual(3 - p.s0 + 1e-9);
    expect(st.v).toBeGreaterThanOrEqual(0);
  });

  it('property: v stays in [0, v0] and the gap never drops below s0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 15, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 15, noNaN: true }),
        (v, gap, leaderSpeed) => {
          const before: MotionState = { s: 0, v: Math.min(v, p.v0) };
          const after = advance(before, { gap, speed: leaderSpeed }, p, DT);
          expect(after.v).toBeGreaterThanOrEqual(0);
          expect(after.v).toBeLessThanOrEqual(p.v0 + 1e-9);
          expect(after.s).toBeGreaterThanOrEqual(before.s);
          const travelled = after.s - before.s;
          expect(gap - travelled).toBeGreaterThanOrEqual(Math.min(gap, p.s0) - 1e-9);
        },
      ),
    );
  });

  it('is deterministic', () => {
    const a = advance({ s: 3, v: 2 }, { gap: 12, speed: 1 }, p, DT);
    const b = advance({ s: 3, v: 2 }, { gap: 12, speed: 1 }, p, DT);
    expect(a).toEqual(b);
  });
});
