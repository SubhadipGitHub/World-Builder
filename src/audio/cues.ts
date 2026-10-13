import type { PhaseChange } from '../airport/phases';
import type { Environment } from '../render/environment';
import type { Strike } from '../render/lightning';
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
  const d = Math.hypot(x - listener.x, z - listener.z);
  if (d >= radiusM) return 0;
  const falloff = (1 - d / radiusM) ** 2;
  return falloff * zoomFactor(listener.distance);
}

/** Close-ups are loud, the overview is calm: clamp(180 / distance, 0.25, 1) (F16). */
const zoomFactor = (distance: number): number => Math.min(1, Math.max(0.25, 180 / Math.max(1, distance)));
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Stereo spread: screen x in [−1, 1] → pan in [−0.8, 0.8]. */
const MAX_PAN = 0.8;

export interface CuePlanner {
  plan(input: CueInput): Cue[];
}

/** Holds cool-down state between frames. */
export function createCuePlanner(): CuePlanner {
  const lastPlayed = new Map<string, number>();
  /** True (and remembered) unless the source played within its cool-down. */
  const allow = (key: string, kind: CueKind, now: number): boolean => {
    const last = lastPlayed.get(key);
    if (last !== undefined && now - last < (COOLDOWN_SEC[kind] ?? 0)) return false;
    lastPlayed.set(key, now);
    return true;
  };
  return {
    plan(input) {
      const cues: Cue[] = [];
      const { listener, nowSec: now } = input;
      const panAt = (x: number, z: number): number => MAX_PAN * Math.min(1, Math.max(-1, input.project(x, z) ?? 0));
      const world = (kind: CueKind, key: string, x: number, z: number, radius: number, level: number, delaySec = 0, floor = 0): void => {
        const gain = clamp01(Math.max(floor, spatialGain(listener, x, z, radius)) * level);
        if (gain <= 0 || !allow(key, kind, now)) return;
        cues.push({ kind, gain, pan: panAt(x, z), delaySec, sourceKey: key });
      };
      // World cues stop while the simulation is paused (FE-18).
      if (!input.paused) {
        for (const e of input.events) {
          if (e.type !== 'checkout') continue;
          const gate = input.gateAt(e.gateId);
          if (!gate) continue;
          world('gateBeep', `gateBeep:${e.gateId}`, gate.x, gate.z, HUB_RADIUS_M, 0.6);
          world('barrier', `barrier:${e.gateId}`, gate.x, gate.z, HUB_RADIUS_M, 0.35, 0.5);
        }
        for (const p of input.phases) {
          // Jets carry a long way: a quiet floor so a take-off is always faintly heard.
          if (p.to === 'takeoff') world('jetTakeoff', `jet:${p.id}`, p.x, p.z, FAR_RADIUS_M, 0.9, 0, 0.15);
          else if (p.to === 'landing') world('jetLanding', `jet:${p.id}`, p.x, p.z, FAR_RADIUS_M, 0.7, 0, 0.12);
        }
        for (const s of input.strikes) {
          const near = 1 - Math.min(1, Math.hypot(s.x - listener.x, s.z - listener.z) / FAR_RADIUS_M);
          cues.push({ kind: 'thunder', gain: clamp01(0.35 + 0.55 * near), pan: panAt(s.x, s.z), delaySec: s.strike.thunderDelaySec, sourceKey: `thunder:${String(s.strike.seed)}` });
        }
      }
      // Alert chimes play even while paused; they are not in the world, so they sit in the centre.
      for (const t of input.newToasts) {
        const kind: CueKind = t.severity === 'critical' ? 'chimeCritical' : 'chimeWarning';
        if (allow(`chime:${t.severity}`, kind, now)) cues.push({ kind, gain: t.severity === 'critical' ? 0.7 : 0.5, pan: 0, delaySec: 0, sourceKey: `chime:${t.severity}` });
      }
      return cues;
    },
  };
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
  const day = 1 - env.nightFactor;
  const wind = env.wind;
  const zoom = zoomFactor(o.listenerDistance);
  const beds: Record<BedKind, number> = {
    // Distant traffic and the hub's hum: busiest by day, never quite silent.
    hub: (0.15 + 0.35 * day) * (0.6 + 0.4 * zoom),
    // Crickets after dark, hushed by rain.
    night: 0.4 * env.nightFactor * (env.rain ? 0.3 : 1),
    rain: env.rain ? 0.5 : 0,
    storm: env.storm ? 0.55 : 0,
    wind: 0.7 * clamp01(wind.strength * (0.6 + 0.4 * wind.gust)),
    cicadas: env.heat ? 0.4 * day : 0,
    whir: o.washBusy > 0 ? Math.min(1, 0.25 * o.washBusy) * zoom : 0,
  };
  const duck = o.paused ? 0.2 : 1;
  for (const k of Object.keys(beds) as BedKind[]) beds[k] = clamp01(beds[k] * duck);
  return beds;
}
