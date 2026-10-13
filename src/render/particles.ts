import { energyOf } from '../config/fleet';
import type { VehicleClass } from '../sim/types';

// Ambient particles (M9, FE-14, FE-15, architecture F14): the pure pool, caps and emitter rules.
// The Three.js view (2 instanced billboard meshes) is render/particlesView.ts.

export type ParticleKind = 'exhaust' | 'spray' | 'steam' | 'splash' | 'jetExhaust' | 'tyreSmoke' | 'leaf' | 'dust';

export interface ParticleSeed {
  readonly kind: ParticleKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** Lifetime in seconds. */
  readonly life: number;
  readonly size: number;
}

export interface Particle extends ParticleSeed {
  /** Seconds since emission. */
  readonly age: number;
}

/** Pool capacity: 600 on tier 0, 300 on tier 1, none on tier 2 or with reduced motion (FE-15). */
export function particleCap(tier: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return tier <= 0 ? 600 : tier === 1 ? 300 : 0;
}

export interface ParticlePool {
  /** Adds a particle; when full, the oldest is replaced (ring buffer). No-op at capacity 0. */
  emit(p: ParticleSeed): void;
  /** Ages and moves every particle; expired ones are removed. */
  step(dt: number): void;
  live(): number;
  forEach(fn: (p: Particle) => void): void;
}

type Live = { -readonly [K in keyof Particle]: Particle[K] };

export function createParticlePool(cap: number): ParticlePool {
  // Oldest first, so a full pool drops its oldest particle.
  let items: Live[] = [];
  return {
    emit(p) {
      if (cap <= 0) return;
      if (items.length >= cap) items.shift();
      items.push({ ...p, age: 0 });
    },
    step(dt) {
      for (const p of items) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      if (items.some((p) => p.age >= p.life)) items = items.filter((p) => p.age < p.life);
    },
    live: () => items.length,
    forEach(fn) {
      for (const p of items) fn(p);
    },
  };
}

export interface EmitterAgent {
  readonly id: string;
  readonly kind: string;
  readonly cls: VehicleClass | null;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
}

/** Petrol service vehicles; technician carts are electric. */
const PETROL_KINDS: ReadonlySet<string> = new Set(['shuttle', 'tow', 'van']);
/** Below this a car is parked or creeping (m/s). */
const MOVING = 0.5;

/** Exhaust puffs from moving petrol fleet cars and service vehicles; EVs never emit (FE-14). */
export function exhaustEmitters(agents: readonly EmitterAgent[]): readonly EmitterAgent[] {
  return agents.filter((a) => {
    if (a.speed <= MOVING) return false;
    if (a.kind === 'fleet') return a.cls !== null && energyOf(a.cls) === 'petrol';
    return PETROL_KINDS.has(a.kind);
  });
}
