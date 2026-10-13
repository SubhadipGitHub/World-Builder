import { MAX_VOICES, type BedKind, type Cue } from './cues';
import { makeBed, makeNoise, playVoice, type NoiseBank } from './synth';

// Web Audio engine (M9, FE-16…FE-18, architecture F15, F17, F18). No audio files: oscillators and generated noise.

export interface SoundEngineState {
  /** An AudioContext exists (only after the first enable). */
  readonly created: boolean;
  /** The context is running (enabled, tab visible). */
  readonly running: boolean;
  readonly enabled: boolean;
  /** Voices currently playing, ≤ MAX_VOICES. */
  readonly voices: number;
  /** Master volume, 0–1. */
  readonly volume: number;
}

export interface SoundEngine {
  /** Turns sound on; creates and resumes the context. Must be called inside a user gesture. */
  enable(): void;
  disable(): void;
  /** Clamped to 0–1. */
  setVolume(v01: number): void;
  play(cues: readonly Cue[]): void;
  setBeds(gains: Readonly<Record<BedKind, number>>): void;
  state(): SoundEngineState;
  dispose(): void;
}

export interface SoundEngineDeps {
  /** Factory for the AudioContext (a fake in unit tests). */
  createContext(): AudioContext;
  /** For visibilitychange: hidden suspends, visible resumes. */
  readonly doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
}

const BEDS: readonly BedKind[] = ['hub', 'night', 'rain', 'storm', 'wind', 'cicadas', 'whir'];
/** Seconds for a bed to settle on a new level (no zipper noise). */
const BED_SMOOTH_SEC = 0.5;
const DEFAULT_VOLUME = 0.6;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

interface Live {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly noise: NoiseBank;
  readonly beds: ReadonlyMap<BedKind, GainNode>;
}

export function createSoundEngine(deps: SoundEngineDeps): SoundEngine {
  let live: Live | null = null;
  let enabled = false;
  let volume = DEFAULT_VOLUME;
  /** Scheduled end times of the voices still sounding. */
  let ends: number[] = [];

  const active = (): number => {
    if (!live) return 0;
    const now = live.ctx.currentTime;
    ends = ends.filter((t) => t > now);
    return ends.length;
  };

  const onVisibility = (): void => {
    if (!live) return;
    if (deps.doc.visibilityState === 'hidden') void live.ctx.suspend();
    else if (enabled) void live.ctx.resume();
  };
  deps.doc.addEventListener('visibilitychange', onVisibility);

  const create = (): Live => {
    const ctx = deps.createContext();
    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    const noise = makeNoise(ctx);
    const beds = new Map(BEDS.map((k) => [k, makeBed(ctx, noise, k, master)] as const));
    return { ctx, master, noise, beds };
  };

  return {
    enable() {
      live ??= create();
      enabled = true;
      if (deps.doc.visibilityState !== 'hidden') void live.ctx.resume();
    },
    disable() {
      enabled = false;
      ends = [];
      if (live) void live.ctx.suspend();
    },
    setVolume(v) {
      volume = clamp01(v);
      if (live) live.master.gain.setTargetAtTime(volume, live.ctx.currentTime, 0.05);
    },
    play(cues) {
      if (!enabled || !live) return;
      const { ctx, master, noise } = live;
      for (const cue of cues) {
        // At the cap, further cues this frame are dropped (they are short and cooled down anyway).
        if (active() >= MAX_VOICES) break;
        const at = ctx.currentTime + cue.delaySec;
        const pan = ctx.createStereoPanner();
        pan.pan.value = cue.pan;
        const gain = ctx.createGain();
        gain.gain.value = cue.gain;
        pan.connect(gain);
        gain.connect(master);
        ends.push(at + playVoice(ctx, noise, pan, cue.kind, at));
      }
    },
    setBeds(gains) {
      if (!enabled || !live) return;
      const now = live.ctx.currentTime;
      for (const [kind, node] of live.beds) node.gain.setTargetAtTime(clamp01(gains[kind]), now, BED_SMOOTH_SEC);
    },
    state() {
      const running = enabled && live !== null && live.ctx.state === 'running';
      return { created: live !== null, running, enabled, voices: active(), volume };
    },
    dispose() {
      deps.doc.removeEventListener('visibilitychange', onVisibility);
      if (live) void live.ctx.close();
      live = null;
      enabled = false;
    },
  };
}
