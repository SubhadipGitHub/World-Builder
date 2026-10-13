import { describe, expect, it } from 'vitest';
import { KIOSK_AREAS, KIOSK_DWELL_SEC, KIOSK_IDLE_SEC, createKioskScheduler } from '../../../src/share/kiosk';

// Requirements SH-9, SH-10, D44, Q3; architecture §21 J6.

const make = () => createKioskScheduler({ areas: KIOSK_AREAS, dwellSec: KIOSK_DWELL_SEC, idleSec: KIOSK_IDLE_SEC });

/** Advances in 1/60 s frames; returns every area the scheduler asked for. */
function run(k: ReturnType<typeof make>, sec: number): string[] {
  const out: string[] = [];
  const frames = Math.round(sec * 60);
  for (let i = 0; i < frames; i++) {
    const a = k.tick(1 / 60);
    if (a) out.push(a);
  }
  return out;
}

describe('kiosk tour (SH-9, Q3)', () => {
  it('visits all six areas in order, 20 s each', () => {
    expect(KIOSK_AREAS).toEqual(['overview', 'return', 'wash', 'energy', 'lot', 'airport']);
    expect(KIOSK_DWELL_SEC).toBe(20);
    expect(KIOSK_IDLE_SEC).toBe(60);
  });

  it('starts on the first area and moves on when the dwell ends', () => {
    const k = make();
    expect(k.state()).toEqual({ phase: 'touring', area: 'overview', dwellLeftSec: 20, resumeInSec: null });
    expect(k.tick(19.9)).toBeNull();
    expect(k.tick(0.2)).toBe('return');
    expect(k.state().area).toBe('return');
    // Each area gets a full dwell; a long frame's overshoot is not carried over.
    expect(k.state().dwellLeftSec).toBe(20);
  });

  it('wraps around after the last area (a 2-minute loop)', () => {
    const k = make();
    expect(run(k, 120.5)).toEqual(['return', 'wash', 'energy', 'lot', 'airport', 'overview']);
  });

  it('never skips an area on a long frame', () => {
    const k = make();
    expect(k.tick(55)).toBe('return');
    expect(k.tick(0)).toBeNull();
  });
});

describe('kiosk input (SH-10, D44)', () => {
  it('pauses on input and freezes the dwell', () => {
    const k = make();
    k.tick(5);
    k.input();
    expect(k.state()).toEqual({ phase: 'paused', area: 'overview', dwellLeftSec: 15, resumeInSec: 60 });
    expect(run(k, 30)).toEqual([]);
    expect(k.state().dwellLeftSec).toBe(15);
    expect(k.state().resumeInSec).toBeCloseTo(30, 6);
  });

  it('restarts the 60 s countdown on each input', () => {
    const k = make();
    k.input();
    expect(k.tick(59)).toBeNull();
    k.input();
    expect(k.tick(59)).toBeNull();
    expect(k.state().phase).toBe('paused');
  });

  it('resumes after 60 s idle on the next area, with a full dwell', () => {
    const k = make();
    k.tick(5);
    k.input();
    expect(k.tick(59.9)).toBeNull();
    expect(k.tick(0.2)).toBe('return');
    expect(k.state()).toEqual({ phase: 'touring', area: 'return', dwellLeftSec: 20, resumeInSec: null });
  });

  it('exits for good', () => {
    const k = make();
    k.exit();
    expect(k.state().phase).toBe('exited');
    expect(run(k, 200)).toEqual([]);
    k.input();
    expect(k.state().phase).toBe('exited');
    expect(k.state().resumeInSec).toBeNull();
  });

  it('ignores negative or non-finite time steps', () => {
    const k = make();
    expect(k.tick(-5)).toBeNull();
    expect(k.tick(Number.NaN)).toBeNull();
    expect(k.state().dwellLeftSec).toBe(20);
  });
});
