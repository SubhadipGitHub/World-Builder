import { describe, expect, it } from 'vitest';
import type { PhaseChange } from '../../../src/airport/phases';
import { FAR_RADIUS_M, HUB_RADIUS_M, bedMix, createCuePlanner, spatialGain, type CueInput } from '../../../src/audio/cues';
import { environmentFor, type Environment } from '../../../src/render/environment';
import type { Strike } from '../../../src/render/lightning';
import type { SimEvent } from '../../../src/sim/events';
import type { Toast } from '../../../src/ui/toasts';

// M9 (FE-16…FE-18; architecture F15, F16).

const listener = { x: 0, z: 0, distance: 180 };
const checkout = (gateId: string, t = 0): SimEvent => ({
  type: 'checkout',
  vehicleId: 'GL-PGW-00001',
  agreementNo: 'RA-26-0000001',
  tier: 'Gold',
  gateId,
  cls: 'sedan',
  ratePerDay: 55,
  simTimeSec: t,
});
const toast = (severity: 'warning' | 'critical'): Toast => ({ id: `t-${severity}`, alertId: 'a', severity, message: 'm', count: 1, vehicleId: null, unitId: null });
const strike = (over: Partial<Strike> = {}): Strike => ({ t: 10, seed: 1, distanceM: 900, thunderDelaySec: 2.5, azimuthRad: 0, ...over });

const input = (over: Partial<CueInput> = {}): CueInput => ({
  events: [],
  phases: [],
  strikes: [],
  newToasts: [],
  listener,
  project: (x) => Math.max(-1, Math.min(1, x / 100)),
  gateAt: (id) => (id === 'gate1' ? { x: 60, z: 0 } : id === 'gate2' ? { x: -60, z: 0 } : null),
  paused: false,
  nowSec: 0,
  ...over,
});

describe('spatialGain (F16)', () => {
  it('is loudest at the camera target and silent beyond the radius', () => {
    expect(spatialGain(listener, 0, 0, HUB_RADIUS_M)).toBeCloseTo(1);
    expect(spatialGain(listener, HUB_RADIUS_M + 1, 0, HUB_RADIUS_M)).toBe(0);
    expect(spatialGain(listener, 100, 0, HUB_RADIUS_M)).toBeLessThan(spatialGain(listener, 50, 0, HUB_RADIUS_M));
  });

  it('quietens as the camera zooms out, down to a quarter', () => {
    const near = spatialGain({ ...listener, distance: 120 }, 0, 0, HUB_RADIUS_M);
    const far = spatialGain({ ...listener, distance: 1_000 }, 0, 0, HUB_RADIUS_M);
    expect(near).toBeCloseTo(1);
    expect(far).toBeCloseTo(0.25);
  });
});

describe('createCuePlanner (FE-16, FE-17)', () => {
  it('beeps once per checkout, panned towards the gate', () => {
    const p = createCuePlanner();
    const right = p.plan(input({ events: [checkout('gate1')] })).filter((c) => c.kind === 'gateBeep');
    expect(right).toHaveLength(1);
    expect(right[0]!.pan).toBeGreaterThan(0);
    const left = createCuePlanner()
      .plan(input({ events: [checkout('gate2')] }))
      .filter((c) => c.kind === 'gateBeep');
    expect(left[0]!.pan).toBeLessThan(0);
  });

  it('cools down a source for 2 s so it never machine-guns', () => {
    const p = createCuePlanner();
    expect(p.plan(input({ events: [checkout('gate1')], nowSec: 0 })).filter((c) => c.kind === 'gateBeep')).toHaveLength(1);
    expect(p.plan(input({ events: [checkout('gate1')], nowSec: 1 })).filter((c) => c.kind === 'gateBeep')).toHaveLength(0);
    // A different gate is a different source.
    expect(p.plan(input({ events: [checkout('gate2')], nowSec: 1 })).filter((c) => c.kind === 'gateBeep')).toHaveLength(1);
    expect(p.plan(input({ events: [checkout('gate1')], nowSec: 2.1 })).filter((c) => c.kind === 'gateBeep')).toHaveLength(1);
  });

  it('plays jets on take-off and landing, audible from far away', () => {
    const phases: PhaseChange[] = [
      { id: 'j1', from: 'taxiOut', to: 'takeoff', x: 800, z: 480 },
      { id: 'j2', from: 'approach', to: 'landing', x: -400, z: 480 },
      { id: 'j3', from: 'taxiIn', to: 'parked', x: 0, z: 345 },
    ];
    const cues = createCuePlanner().plan(input({ phases }));
    expect(cues.map((c) => c.kind).sort()).toEqual(['jetLanding', 'jetTakeoff']);
    expect(cues.every((c) => c.gain > 0)).toBe(true);
    expect(FAR_RADIUS_M).toBeGreaterThan(1_000);
  });

  it('rolls thunder after each strike, delayed by the strike', () => {
    const cues = createCuePlanner().plan(input({ strikes: [{ strike: strike({ thunderDelaySec: 3.2 }), x: 300, z: 600 }] }));
    const thunder = cues.filter((c) => c.kind === 'thunder');
    expect(thunder).toHaveLength(1);
    expect(thunder[0]!.delaySec).toBeCloseTo(3.2);
  });

  it('chimes for new toasts by severity', () => {
    const cues = createCuePlanner().plan(input({ newToasts: [toast('warning'), toast('critical')] }));
    expect(cues.map((c) => c.kind).sort()).toEqual(['chimeCritical', 'chimeWarning']);
    for (const c of cues) expect(c.pan).toBe(0);
  });

  it('drops world cues while paused but keeps the chimes (FE-18)', () => {
    const cues = createCuePlanner().plan(
      input({ paused: true, events: [checkout('gate1')], phases: [{ id: 'j1', from: 'taxiOut', to: 'takeoff', x: 0, z: 0 }], newToasts: [toast('warning')] }),
    );
    expect(cues.map((c) => c.kind)).toEqual(['chimeWarning']);
  });

  it('keeps gains in 0–1 and pans in ±0.8', () => {
    const cues = createCuePlanner().plan(
      input({
        events: [checkout('gate1'), checkout('gate2')],
        project: () => 1,
        strikes: [{ strike: strike(), x: 0, z: 0 }],
        newToasts: [toast('critical')],
      }),
    );
    for (const c of cues) {
      expect(c.gain).toBeGreaterThanOrEqual(0);
      expect(c.gain).toBeLessThanOrEqual(1);
      expect(Math.abs(c.pan)).toBeLessThanOrEqual(0.8);
    }
  });
});

describe('bedMix (FE-16)', () => {
  const opts = { reducedMotion: false, qualityTier: 0 };
  const env = (w: Parameters<typeof environmentFor>[0], h: number, over: Partial<Environment> = {}): Environment => ({ ...environmentFor(w, h, 'auto', opts), ...over });
  const mix = (e: Environment, paused = false, washBusy = 0) => bedMix(e, { paused, washBusy, listenerDistance: 180 });

  it('follows rain, storm, night and heat', () => {
    expect(mix(env('rain', 12)).rain).toBeGreaterThan(0.3);
    expect(mix(env('clear', 12)).rain).toBe(0);
    expect(mix(env('storm', 12)).storm).toBeGreaterThan(0.3);
    expect(mix(env('rain', 12)).storm).toBe(0);
    expect(mix(env('clear', 23)).night).toBeGreaterThan(0.2);
    expect(mix(env('clear', 12)).night).toBe(0);
    expect(mix(env('clear', 12)).hub).toBeGreaterThan(mix(env('clear', 3)).hub);
    expect(mix(env('heatwave', 13)).cicadas).toBeGreaterThan(0.2);
    expect(mix(env('clear', 13)).cicadas).toBe(0);
  });

  it('scales the wind bed with the wind', () => {
    const calm = mix(env('clear', 12, { wind: { dirRad: 0, strength: 0.05, gust: 0 } })).wind;
    const gale = mix(env('clear', 12, { wind: { dirRad: 0, strength: 0.9, gust: 0.5 } })).wind;
    expect(gale).toBeGreaterThan(calm + 0.3);
  });

  it('whirs while a wash bay is busy', () => {
    expect(mix(env('clear', 12), false, 0).whir).toBe(0);
    expect(mix(env('clear', 12), false, 2).whir).toBeGreaterThan(0);
  });

  it('ducks every bed to at most 20% while paused, and stays in 0–1', () => {
    const live = mix(env('storm', 22, { wind: { dirRad: 0, strength: 1, gust: 1 } }), false, 2);
    const paused = mix(env('storm', 22, { wind: { dirRad: 0, strength: 1, gust: 1 } }), true, 2);
    for (const k of Object.keys(live) as (keyof typeof live)[]) {
      expect(live[k]).toBeGreaterThanOrEqual(0);
      expect(live[k]).toBeLessThanOrEqual(1);
      expect(paused[k]).toBeLessThanOrEqual(0.2 * live[k] + 1e-9);
    }
  });
});
