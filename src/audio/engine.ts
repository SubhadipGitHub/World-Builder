import { notImplemented } from '../shared/notImplemented';
import type { BedKind, Cue } from './cues';

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

export function createSoundEngine(deps: SoundEngineDeps): SoundEngine {
  return notImplemented(deps);
}
