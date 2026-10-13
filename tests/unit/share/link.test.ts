import { describe, expect, it } from 'vitest';
import { cameraLimits } from '../../../src/app/limits';
import { presets } from '../../../src/config/scenarios';
import { hub, type AreaId } from '../../../src/layout/hub';
import { LINK_DEFAULTS, formatLink, parseLink, toSpeed, toSpeedLink, type LinkState } from '../../../src/share/link';
import { createRng } from '../../../src/sim/rng';

// Requirements SH-5…SH-7, D41, D42; architecture §21 J1, J2, J4.

const BASE = 'https://example.github.io/World-Builder/';
const limits = cameraLimits();
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

describe('parseLink: valid values (SH-5)', () => {
  it('returns nothing for an empty query', () => {
    expect(parseLink('')).toEqual({ state: {}, ignored: [] });
    expect(parseLink('?')).toEqual({ state: {}, ignored: [] });
  });

  it('reads every key', () => {
    const { state, ignored } = parseLink(
      '?area=wash&weather=rain&tod=night&speed=0&labels=0&theme=light&quality=2&seed=demo-1_x&preset=washDown&select=wash1&kiosk=1&embed=1',
    );
    expect(ignored).toEqual([]);
    expect(state).toEqual({
      area: 'wash',
      weather: 'rain',
      tod: 'night',
      speed: 0,
      labels: false,
      theme: 'light',
      quality: 2,
      seed: 'demo-1_x',
      preset: 'washDown',
      select: 'wash1',
      kiosk: true,
      embed: true,
    });
  });

  it('accepts the query without a leading "?"', () => {
    expect(parseLink('area=lot').state).toEqual({ area: 'lot' });
  });

  it('accepts every area, preset, speed and quality value', () => {
    for (const a of hub.areas) expect(parseLink(`?area=${a.id}`).state.area).toBe(a.id);
    for (const p of presets) expect(parseLink(`?preset=${p.id}`).state.preset).toBe(p.id);
    for (const s of [0, 15, 30, 45] as const) expect(parseLink(`?speed=${String(s)}`).state.speed).toBe(s);
    expect(parseLink('?quality=auto').state.quality).toBe('auto');
    expect(parseLink('?quality=0').state.quality).toBe(0);
    expect(parseLink('?labels=1&kiosk=1').state).toEqual({ labels: true, kiosk: true });
  });

  it('accepts unit ids and facility ids for select', () => {
    expect(parseLink('?select=gate2').state.select).toBe('gate2');
    expect(parseLink('?select=terminal').state.select).toBe('terminal');
    expect(parseLink('?select=evHub').state.select).toBe('evHub');
  });

  it('reads cam as x,z,azimuth,elevation,distance (degrees), with commas plain or encoded', () => {
    const cam = { x: 10, z: 20.5, azimuthDeg: 45, elevationDeg: 30, distance: 200 };
    expect(parseLink('?cam=10,20.5,45,30,200').state.cam).toEqual(cam);
    expect(parseLink('?cam=10%2C20.5%2C45%2C30%2C200').state.cam).toEqual(cam);
  });

  it('clamps cam to the camera limits (I-1)', () => {
    const { state, ignored } = parseLink('?cam=99999,-99999,400,89,99999');
    expect(ignored).toEqual([]);
    expect(state.cam?.x).toBe(limits.maxX);
    expect(state.cam?.z).toBe(limits.minZ);
    expect(state.cam?.distance).toBe(limits.maxDistance);
    expect(state.cam?.elevationDeg).toBeCloseTo(90 - toDeg(limits.minPolar), 6);
    // Azimuth wraps into (−180°, 180°].
    expect(state.cam?.azimuthDeg).toBe(40);
    expect(parseLink('?cam=0,0,0,0,1').state.cam?.elevationDeg).toBeCloseTo(90 - toDeg(limits.maxPolar), 6);
    expect(parseLink('?cam=0,0,0,45,1').state.cam?.distance).toBe(limits.minDistance);
  });

  it('accepts seeds of 1–32 letters, digits, "-" and "_"', () => {
    expect(parseLink('?seed=a').state.seed).toBe('a');
    expect(parseLink(`?seed=${'x'.repeat(32)}`).state.seed).toBe('x'.repeat(32));
  });
});

describe('parseLink: invalid values are ignored (SH-6)', () => {
  it('drops each invalid value and lists its key once, in query order', () => {
    const { state, ignored } = parseLink(
      '?area=moon&weather=snow&tod=dusk&speed=20&labels=yes&theme=blue&quality=3&seed=bad%20seed!&preset=apocalypse&select=nope&kiosk=2&embed=true&cam=1,2,3',
    );
    expect(state).toEqual({});
    expect(ignored).toEqual(['area', 'weather', 'tod', 'speed', 'labels', 'theme', 'quality', 'seed', 'preset', 'select', 'kiosk', 'embed', 'cam']);
  });

  it('ignores unknown keys, keeping the valid ones', () => {
    expect(parseLink('?utm_source=chat&area=lot&foo=1')).toEqual({ state: { area: 'lot' }, ignored: ['utm_source', 'foo'] });
  });

  it('rejects seeds that are empty, too long or have other characters', () => {
    for (const bad of ['', 'x'.repeat(33), 'a b', 'a/b', 'é', '<script>']) {
      expect(parseLink(`?seed=${encodeURIComponent(bad)}`).state.seed).toBeUndefined();
    }
  });

  it('rejects cam values that are not 5 finite numbers', () => {
    for (const bad of ['1,2,3,4', '1,2,3,4,5,6', '1,2,x,4,5', '1,2,3,4,Infinity', 'NaN,0,0,0,100', '']) {
      expect(parseLink(`?cam=${bad}`).state.cam).toBeUndefined();
    }
  });

  it('keeps the first of duplicate keys (valid or not)', () => {
    expect(parseLink('?area=wash&area=lot').state.area).toBe('wash');
    expect(parseLink('?area=moon&area=lot')).toEqual({ state: {}, ignored: ['area'] });
  });

  it('never throws on malformed input', () => {
    for (const q of ['?%', '?%E0%A4%A', '?=&&=', '?area', '?&&&', '??area=wash']) expect(() => parseLink(q)).not.toThrow();
  });
});

describe('formatLink (SH-7, J4)', () => {
  it('is the bare base for the defaults', () => {
    expect(formatLink(BASE, LINK_DEFAULTS)).toBe(BASE);
  });

  it('omits defaults and writes keys in a fixed order', () => {
    const state: LinkState = { ...LINK_DEFAULTS, embed: true, seed: 'demo', area: 'wash', weather: 'rain', speed: 0 };
    expect(formatLink(BASE, state)).toBe(`${BASE}?area=wash&weather=rain&speed=0&seed=demo&embed=1`);
  });

  it('writes cam rounded to 0.1 with plain commas, and booleans as 0/1', () => {
    const state: LinkState = {
      ...LINK_DEFAULTS,
      cam: { x: 10.04, z: -20.06, azimuthDeg: 45, elevationDeg: 30.25, distance: 200 },
      labels: false,
      theme: 'light',
      quality: 1,
      preset: 'fridayRush',
      select: 'gate1',
      kiosk: true,
    };
    expect(formatLink(BASE, state)).toBe(`${BASE}?cam=10,-20.1,45,30.3,200&labels=0&theme=light&quality=1&preset=fridayRush&select=gate1&kiosk=1`);
  });

  it('round-trips random valid states (parse ∘ format = identity)', () => {
    const rng = createRng('links');
    const pick = <T>(xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)] as T;
    const round = (v: number): number => Math.round(v * 10) / 10;
    const areas: readonly AreaId[] = hub.areas.map((a) => a.id);
    for (let i = 0; i < 300; i++) {
      const state: LinkState = {
        area: pick(areas),
        cam:
          rng.next() < 0.5
            ? null
            : {
                x: round(rng.range(limits.minX, limits.maxX)),
                z: round(rng.range(limits.minZ, limits.maxZ)),
                azimuthDeg: round(rng.range(-179, 180)),
                elevationDeg: round(rng.range(90 - toDeg(limits.maxPolar) + 0.1, 90 - toDeg(limits.minPolar) - 0.1)),
                distance: round(rng.range(limits.minDistance, limits.maxDistance)),
              },
        weather: pick(['clear', 'overcast', 'fog', 'rain', 'storm', 'heatwave'] as const),
        tod: pick(['auto', 'day', 'night'] as const),
        speed: pick([0, 15, 30, 45] as const),
        labels: pick([null, true, false] as const),
        theme: pick([null, 'dark', 'light'] as const),
        quality: pick(['auto', 0, 1, 2] as const),
        seed: pick(['goldlane', 'a', 'Demo_2-x', 'z'.repeat(32)]),
        preset: pick([null, ...presets.map((p) => p.id)]),
        // M9 (FE-3): stalls are named by row ('cars-01', was 'sedan-01').
        select: pick([null, 'wash1', 'charger8', 'terminal', 'cars-01']),
        kiosk: rng.next() < 0.5,
        embed: rng.next() < 0.5,
      };
      const link = formatLink(BASE, state);
      const parsed = parseLink(new URL(link).search);
      expect(parsed.ignored).toEqual([]);
      expect({ ...LINK_DEFAULTS, ...parsed.state }).toEqual(state);
    }
  });
});

describe('speed mapping (SH-5)', () => {
  it('maps 0/15/30/45 to 0–3 steps per tick and back', () => {
    expect([0, 15, 30, 45].map((s) => toSpeed(s as 0 | 15 | 30 | 45))).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3].map((s) => toSpeedLink(s as 0 | 1 | 2 | 3))).toEqual([0, 15, 30, 45]);
  });
});
