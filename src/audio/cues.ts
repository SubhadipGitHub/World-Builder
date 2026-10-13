import type { PhaseChange } from '../airport/phases';
import type { Environment } from '../render/environment';
import type { Strike } from '../render/lightning';
import { notImplemented } from '../shared/notImplemented';
import type { SimEvent } from '../sim/events';
import type { Vec2 } from '../sim/types';
import type { Toast } from '../ui/toasts';

// Sound planning (M9, FE-16, FE-17, architecture F15, F16). Pure: no Web Audio here.

export type BedKind = 'hub' | 'night' | 'rain' | 'storm' | 'wind' | 'cicadas' | 'whir';
export type CueKind = 'gateBeep' | 'barrier' | 'jetTakeoff' | 'jetLanding' | 'thunder' | 'chimeWarning' | 'chimeCritical' | 'ping';

/** Most voices playing at once (FE-17). */
export const MAX_VOICES = 16;
/** Falloff radius for hub cues, metres from the camera target (F16). */
export const HUB_RADIUS_M = 250;
/** Falloff radius for jets and thunder (F16). */
export const FAR_RADIUS_M = 1_500;
/** Cool-downs per source, seconds (F16). */
export const COOLDOWN_SEC: Readonly<Partial<Record<CueKind, number>>> = {
  gateBeep: 2,
  barrier: 2,
  chimeWarning: 1,
  chimeCritical: 1,
  ping: 1,
  jetTakeoff: 5,
  jetLanding: 5,
};

export interface Cue {
  readonly kind: CueKind;
  /** 0–1 before the master volume. */
  readonly gain: number;
  /** Stereo pan, −0.8 … 0.8. */
  readonly pan: number;
  readonly delaySec: number;
  /** Cool-down key, e.g. "gateBeep:gate1". */
  readonly sourceKey: string;
}

export interface Listener {
  /** Camera target on the ground. */
  readonly x: number;
  readonly z: number;
  /** Camera distance from its target, metres. */
  readonly distance: number;
}

export interface StrikeAt {
  readonly strike: Strike;
  /** Ground position of the strike. */
  readonly x: number;
  readonly z: number;
}

export interface CueInput {
  readonly events: readonly SimEvent[];
  readonly phases: readonly PhaseChange[];
  readonly strikes: readonly StrikeAt[];
  readonly newToasts: readonly Toast[];
  readonly listener: Listener;
  /** Screen x of a ground point in [−1, 1], or null when behind the camera. */
  project(x: number, z: number): number | null;
  /** World position of an exit gate, or null if unknown. */
  gateAt(gateId: string): Vec2 | null;
  /** Simulation paused (speed 0): world cues are dropped, chimes still play (FE-18). */
  readonly paused: boolean;
  /** Wall seconds, for cool-downs. */
  readonly nowSec: number;
}

/** Gain for a world cue: (1 − d / R)² × clamp(180 / distance, 0.25, 1); 0 beyond R (F16). */
export function spatialGain(listener: Listener, x: number, z: number, radiusM: number): number {
  return notImplemented(listener, x, z, radiusM);
}

export interface CuePlanner {
  plan(input: CueInput): Cue[];
}

/** Holds cool-down state between frames. */
export function createCuePlanner(): CuePlanner {
  return notImplemented();
}

export interface BedOptions {
  readonly paused: boolean;
  /** Wash bays currently in use. */
  readonly washBusy: number;
  readonly listenerDistance: number;
}

/**
 * Target gain per bed, 0–1 (FE-16): hub by day, night insects, rain, storm, wind × strength, cicadas in a heatwave,
 * and the wash whir. Paused ducks every bed to 20% (FE-18).
 */
export function bedMix(env: Environment, o: BedOptions): Readonly<Record<BedKind, number>> {
  return notImplemented(env, o);
}
