import { notImplemented } from '../shared/notImplemented';
import type { VehicleClass } from '../sim/types';

// Ambient particles (M9, FE-14, FE-15, architecture F14). This file holds the pure pool and caps; the
// Three.js view (2 instanced billboard meshes) is added in Stage 4.

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
  return notImplemented(tier, reducedMotion);
}

export interface ParticlePool {
  /** Adds a particle; when full, the oldest is replaced (ring buffer). No-op at capacity 0. */
  emit(p: ParticleSeed): void;
  /** Ages and moves every particle; expired ones are removed. */
  step(dt: number): void;
  live(): number;
  forEach(fn: (p: Particle) => void): void;
}

export function createParticlePool(cap: number): ParticlePool {
  return notImplemented(cap);
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

/** Exhaust puffs from moving petrol fleet cars and service vehicles; EVs never emit (FE-14). */
export function exhaustEmitters(agents: readonly EmitterAgent[]): readonly EmitterAgent[] {
  return notImplemented(agents);
}
