import { describe, expect, it } from 'vitest';
import { createParticlePool, exhaustEmitters, particleCap, type ParticleSeed } from '../../../src/render/particles';

// M9 (FE-14, FE-15; architecture F14).

const seed = (over: Partial<ParticleSeed> = {}): ParticleSeed => ({ kind: 'exhaust', x: 0, y: 0.4, z: 0, vx: 0, vy: 0.5, vz: 0, life: 1, size: 0.3, ...over });

describe('particleCap (FE-15)', () => {
  it('scales by quality tier and turns off with reduced motion', () => {
    expect(particleCap(0, false)).toBe(600);
    expect(particleCap(1, false)).toBe(300);
    expect(particleCap(2, false)).toBe(0);
    expect(particleCap(0, true)).toBe(0);
  });
});

describe('createParticlePool', () => {
  it('ages, moves and expires particles', () => {
    const pool = createParticlePool(10);
    pool.emit(seed({ life: 1, vy: 2 }));
    pool.step(0.5);
    let y = 0;
    pool.forEach((p) => {
      y = p.y;
      expect(p.age).toBeCloseTo(0.5);
    });
    expect(y).toBeGreaterThan(0.4);
    pool.step(0.6);
    expect(pool.live()).toBe(0);
  });

  it('never exceeds its capacity, replacing the oldest', () => {
    const pool = createParticlePool(5);
    for (let i = 0; i < 12; i++) pool.emit(seed({ x: i, life: 10 }));
    expect(pool.live()).toBe(5);
    const xs: number[] = [];
    pool.forEach((p) => xs.push(p.x));
    expect(xs.sort((a, b) => a - b)).toEqual([7, 8, 9, 10, 11]);
  });

  it('ignores emits at capacity 0 (tier 2, reduced motion)', () => {
    const pool = createParticlePool(0);
    pool.emit(seed());
    expect(pool.live()).toBe(0);
  });
});

describe('exhaustEmitters (FE-14)', () => {
  const car = (id: string, cls: 'ev' | 'sedan' | 'pickup' | null, kind = 'fleet', speed = 3) => ({ id, kind, cls, x: 0, z: 0, heading: 0, speed });

  it('puffs from moving petrol cars and service vehicles, never from EVs', () => {
    const out = exhaustEmitters([car('a', 'sedan'), car('b', 'ev'), car('c', 'pickup'), car('d', null, 'shuttle'), car('e', null, 'pedestrian', 1)]);
    expect(out.map((a) => a.id)).toEqual(['a', 'c', 'd']);
  });

  it('skips parked cars', () => {
    expect(exhaustEmitters([car('a', 'sedan', 'fleet', 0)])).toEqual([]);
  });
});
