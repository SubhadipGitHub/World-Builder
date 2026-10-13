import type { BedKind, CueKind } from './cues';

// Procedural voices (M9, FE-16, architecture F18): oscillators and noise generated in JS. No audio files, no fetches.

export type NoiseColour = 'white' | 'pink' | 'brown';
export type NoiseBank = Readonly<Record<NoiseColour, AudioBuffer>>;

const NOISE_SEC = 2;

/** Two seconds of each noise colour, generated once per context and looped. */
export function makeNoise(ctx: BaseAudioContext): NoiseBank {
  const length = Math.floor(ctx.sampleRate * NOISE_SEC);
  const make = (fill: (data: Float32Array) => void): AudioBuffer => {
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    fill(buffer.getChannelData(0));
    return buffer;
  };
  return {
    white: make((d) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }),
    // Paul Kellet's economy pink filter.
    pink: make((d) => {
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }),
    // Integrated (red) noise for rumbles.
    brown: make((d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }),
  };
}

function noiseSource(ctx: BaseAudioContext, bank: NoiseBank, colour: NoiseColour, loop: boolean): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = bank[colour];
  src.loop = loop;
  return src;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** A looping bed: a source through a filter into a gain node (silent until mixed in). Returns its gain node. */
export function makeBed(ctx: BaseAudioContext, bank: NoiseBank, kind: BedKind, out: AudioNode): GainNode {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(out);
  const lfo = (rate: number, depth: number, target: AudioParam): void => {
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    const amt = ctx.createGain();
    amt.gain.value = depth;
    osc.connect(amt);
    amt.connect(target);
    osc.start();
  };
  const chain = (src: AudioScheduledSourceNode, f: BiquadFilterNode, level: number): void => {
    const pre = ctx.createGain();
    pre.gain.value = level;
    src.connect(f);
    f.connect(pre);
    pre.connect(gain);
    src.start();
  };
  switch (kind) {
    case 'hub':
      chain(noiseSource(ctx, bank, 'brown', true), filter(ctx, 'lowpass', 320), 0.9);
      return gain;
    case 'night': {
      // Crickets: a narrow band of noise, pulsed.
      const f = filter(ctx, 'bandpass', 4_500, 12);
      const pulse = ctx.createGain();
      pulse.gain.value = 0.5;
      const src = noiseSource(ctx, bank, 'white', true);
      src.connect(f);
      f.connect(pulse);
      pulse.connect(gain);
      lfo(16, 0.5, pulse.gain);
      src.start();
      return gain;
    }
    case 'rain':
      chain(noiseSource(ctx, bank, 'white', true), filter(ctx, 'highpass', 1_200), 0.35);
      return gain;
    case 'storm':
      chain(noiseSource(ctx, bank, 'brown', true), filter(ctx, 'lowpass', 180), 1);
      return gain;
    case 'wind': {
      const f = filter(ctx, 'bandpass', 500, 0.8);
      lfo(0.15, 250, f.frequency);
      chain(noiseSource(ctx, bank, 'pink', true), f, 0.8);
      return gain;
    }
    case 'cicadas': {
      const f = filter(ctx, 'bandpass', 6_000, 4);
      const pulse = ctx.createGain();
      pulse.gain.value = 0.5;
      const src = noiseSource(ctx, bank, 'white', true);
      src.connect(f);
      f.connect(pulse);
      pulse.connect(gain);
      lfo(30, 0.5, pulse.gain);
      src.start();
      return gain;
    }
    case 'whir': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 110;
      chain(osc, filter(ctx, 'lowpass', 420), 0.25);
      return gain;
    }
  }
}

/** One envelope: ramps a gain node from silence to `peak` and back over [at, at + dur]. */
function envelope(g: GainNode, at: number, attack: number, dur: number, peak: number): void {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
}

function tone(ctx: BaseAudioContext, out: AudioNode, type: OscillatorType, hz: number, at: number, dur: number, peak: number, glideTo?: number): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  const g = ctx.createGain();
  envelope(g, at, Math.min(0.02, dur / 4), dur, peak);
  osc.connect(g);
  g.connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

function noiseBurst(ctx: BaseAudioContext, bank: NoiseBank, out: AudioNode, colour: NoiseColour, f: BiquadFilterNode, at: number, attack: number, dur: number, peak: number): void {
  const src = noiseSource(ctx, bank, colour, true);
  const g = ctx.createGain();
  envelope(g, at, attack, dur, peak);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(at);
  src.stop(at + dur + 0.05);
}

/** Schedules one cue into `out` at `at`; returns its length in seconds. */
export function playVoice(ctx: BaseAudioContext, bank: NoiseBank, out: AudioNode, kind: CueKind, at: number): number {
  switch (kind) {
    case 'gateBeep':
      tone(ctx, out, 'sine', 880, at, 0.12, 0.5);
      tone(ctx, out, 'sine', 660, at + 0.16, 0.14, 0.5);
      return 0.35;
    case 'barrier':
      noiseBurst(ctx, bank, out, 'pink', filter(ctx, 'bandpass', 220, 3), at, 0.05, 0.9, 0.5);
      tone(ctx, out, 'sawtooth', 70, at, 0.9, 0.08, 95);
      return 1;
    case 'jetTakeoff': {
      const f = filter(ctx, 'bandpass', 300, 0.7);
      f.frequency.setValueAtTime(300, at);
      f.frequency.exponentialRampToValueAtTime(1_400, at + 5);
      noiseBurst(ctx, bank, out, 'pink', f, at, 1.5, 7, 0.9);
      tone(ctx, out, 'triangle', 1_600, at, 6, 0.05, 2_600);
      return 7;
    }
    case 'jetLanding': {
      const f = filter(ctx, 'bandpass', 900, 0.7);
      f.frequency.setValueAtTime(900, at);
      f.frequency.exponentialRampToValueAtTime(260, at + 4);
      noiseBurst(ctx, bank, out, 'pink', f, at, 0.6, 4.5, 0.8);
      return 4.5;
    }
    case 'thunder':
      noiseBurst(ctx, bank, out, 'brown', filter(ctx, 'lowpass', 180), at, 0.08, 4, 1);
      noiseBurst(ctx, bank, out, 'white', filter(ctx, 'bandpass', 2_000, 0.8), at, 0.01, 0.25, 0.2);
      return 4;
    case 'chimeWarning':
      tone(ctx, out, 'triangle', 660, at, 0.25, 0.45);
      tone(ctx, out, 'triangle', 880, at + 0.2, 0.35, 0.45);
      return 0.6;
    case 'chimeCritical':
      tone(ctx, out, 'triangle', 880, at, 0.2, 0.5);
      tone(ctx, out, 'triangle', 660, at + 0.18, 0.2, 0.5);
      tone(ctx, out, 'triangle', 880, at + 0.36, 0.35, 0.5);
      return 0.75;
    case 'ping':
      tone(ctx, out, 'sine', 1_320, at, 0.18, 0.3);
      return 0.2;
  }
}
