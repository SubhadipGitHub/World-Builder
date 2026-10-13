import { describe, expect, it, vi } from 'vitest';
import { MAX_VOICES, type Cue } from '../../../src/audio/cues';
import { createSoundEngine, type SoundEngineDeps } from '../../../src/audio/engine';

// M9 (FE-16…FE-18; architecture F17, F18). A minimal fake of the Web Audio API.

class FakeParam {
  value = 0;
  setValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number): this {
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class FakeNode {
  connect<T>(n: T): T {
    return n;
  }
  disconnect(): void {
    // nothing to release
  }
}

class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  buffer: unknown = null;
  loop = false;
  frequency = new FakeParam();
  detune = new FakeParam();
  playbackRate = new FakeParam();
  type = 'sine';
  start(): void {
    // starts immediately in the fake
  }
  stop(): void {
    this.onended?.();
  }
}

class FakeContext {
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 8_000;
  destination = new FakeNode();
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
  createGain = () => Object.assign(new FakeNode(), { gain: new FakeParam() });
  createStereoPanner = () => Object.assign(new FakeNode(), { pan: new FakeParam() });
  createBiquadFilter = () => Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam(), gain: new FakeParam() });
  createOscillator = () => new FakeSource();
  createBufferSource = () => new FakeSource();
  createBuffer = (channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, duration: length / sampleRate, getChannelData: (c: number) => data[c]! };
  };
}

function harness() {
  const listeners = new Map<string, () => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const contexts: FakeContext[] = [];
  const deps: SoundEngineDeps = {
    createContext: () => {
      const c = new FakeContext();
      contexts.push(c);
      return c as unknown as AudioContext;
    },
    doc: doc as unknown as SoundEngineDeps['doc'],
  };
  const setVisibility = (v: DocumentVisibilityState): void => {
    doc.visibilityState = v;
    listeners.get('visibilitychange')?.();
  };
  return { engine: createSoundEngine(deps), contexts, setVisibility };
}

const cue = (i: number): Cue => ({ kind: 'gateBeep', gain: 0.5, pan: 0, delaySec: 0, sourceKey: `gate:${String(i)}` });

describe('createSoundEngine', () => {
  it('creates no audio context until sound is turned on (no work while muted)', () => {
    const { engine, contexts } = harness();
    engine.play([cue(1)]);
    expect(contexts).toHaveLength(0);
    expect(engine.state()).toMatchObject({ created: false, running: false, enabled: false, voices: 0 });
  });

  it('creates and resumes one context on enable', () => {
    const { engine, contexts } = harness();
    engine.enable();
    engine.enable();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.resume).toHaveBeenCalled();
    expect(engine.state()).toMatchObject({ created: true, running: true, enabled: true });
  });

  it('caps the voices at 16', () => {
    const { engine } = harness();
    engine.enable();
    engine.play(Array.from({ length: 40 }, (_, i) => cue(i)));
    expect(engine.state().voices).toBeLessThanOrEqual(MAX_VOICES);
    expect(engine.state().voices).toBeGreaterThan(0);
  });

  it('clamps the volume to 0–1', () => {
    const { engine } = harness();
    engine.setVolume(1.7);
    expect(engine.state().volume).toBe(1);
    engine.setVolume(-0.2);
    expect(engine.state().volume).toBe(0);
    engine.setVolume(0.6);
    expect(engine.state().volume).toBeCloseTo(0.6);
  });

  it('suspends while the tab is hidden and resumes when it is visible again', () => {
    const { engine, contexts, setVisibility } = harness();
    engine.enable();
    setVisibility('hidden');
    expect(contexts[0]!.suspend).toHaveBeenCalled();
    expect(engine.state().running).toBe(false);
    setVisibility('visible');
    expect(engine.state().running).toBe(true);
  });

  it('goes silent when disabled and ignores new cues', () => {
    const { engine } = harness();
    engine.enable();
    engine.disable();
    engine.play([cue(1)]);
    expect(engine.state()).toMatchObject({ enabled: false, running: false, voices: 0 });
  });

  it('does not resume a disabled engine when the tab becomes visible', () => {
    const { engine, setVisibility } = harness();
    engine.enable();
    engine.disable();
    setVisibility('hidden');
    setVisibility('visible');
    expect(engine.state().running).toBe(false);
  });
});
