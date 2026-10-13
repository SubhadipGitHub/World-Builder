import { cameraLimits } from '../app/limits';
import { presets, type PresetId } from '../config/scenarios';
import { weatherModes, type WeatherMode } from '../config/weather';
import { hub, type AreaId } from '../layout/hub';
import type { DayNight } from '../render/environment';
import { FACILITIES } from '../ui/facilities';
import type { Speed } from '../ui/m4/SpeedControl';
import type { Theme } from '../ui/theme';

// Deep links (requirements SH-5…SH-7, architecture §21 J1–J4): a pure, allow-listed mapping
// between the query string and the settings a link can carry.

/** Speeds as they appear in a link (hub-clock multiples); 0 is paused. */
export type SpeedLink = 0 | 15 | 30 | 45;

/** Exact camera in a link; elevation = 90° − the rig's polar angle. */
export interface CamLink {
  readonly x: number;
  readonly z: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distance: number;
}

export interface LinkState {
  readonly area: AreaId;
  readonly cam: CamLink | null;
  readonly weather: WeatherMode;
  readonly tod: DayNight;
  readonly speed: SpeedLink;
  /** null: keep the viewer's saved preference. */
  readonly labels: boolean | null;
  /** null: keep the viewer's saved preference. */
  readonly theme: Theme | null;
  readonly quality: 'auto' | 0 | 1 | 2;
  readonly seed: string;
  readonly preset: PresetId | null;
  /** A unit or facility id. */
  readonly select: string | null;
  readonly kiosk: boolean;
  readonly embed: boolean;
}

export const LINK_DEFAULTS: LinkState = {
  area: 'overview',
  cam: null,
  weather: 'clear',
  tod: 'auto',
  speed: 15,
  labels: null,
  theme: null,
  quality: 'auto',
  seed: 'goldlane',
  preset: null,
  select: null,
  kiosk: false,
  embed: false,
};

export interface ParsedLink {
  readonly state: Partial<LinkState>;
  /** Keys that were unknown or had an invalid value, in query order (each once). */
  readonly ignored: readonly string[];
}

type Key = keyof LinkState;
/** Fixed key order for formatLink (the SH-5 table). */
const KEYS: readonly Key[] = ['area', 'cam', 'weather', 'tod', 'speed', 'labels', 'theme', 'quality', 'seed', 'preset', 'select', 'kiosk', 'embed'];

const SEED = /^[A-Za-z0-9_-]{1,32}$/;
const SPEEDS: readonly SpeedLink[] = [0, 15, 30, 45];
const DEG = 180 / Math.PI;
const AREAS: readonly AreaId[] = hub.areas.map((a) => a.id);
const PRESETS: readonly PresetId[] = presets.map((p) => p.id);
/** Every unit id plus the facility ids (SH-5 `select`). */
const SELECTABLE: ReadonlySet<string> = new Set([...Object.values(hub.stations).flatMap((s) => s.units.map((u) => u.id)), ...FACILITIES.map((f) => f.id)]);

const oneOf = <T extends string | number>(list: readonly T[], v: string): T | undefined => list.find((x) => String(x) === v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** Wraps degrees into (−180, 180]. */
const wrapDeg = (d: number): number => {
  if (d > -180 && d <= 180) return d;
  const w = ((((d + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};

function parseCam(v: string): CamLink | undefined {
  const parts = v.split(',');
  if (parts.length !== 5 || parts.some((p) => p.trim() === '')) return undefined;
  const n = parts.map(Number);
  if (!n.every(Number.isFinite)) return undefined;
  const [x = 0, z = 0, azimuth = 0, elevation = 0, distance = 0] = n;
  const l = cameraLimits();
  return {
    x: clamp(x, l.minX, l.maxX),
    z: clamp(z, l.minZ, l.maxZ),
    azimuthDeg: wrapDeg(azimuth),
    elevationDeg: clamp(elevation, 90 - l.maxPolar * DEG, 90 - l.minPolar * DEG),
    distance: clamp(distance, l.minDistance, l.maxDistance),
  };
}

/** One key's value, or undefined if invalid. */
function parseValue(key: Key, v: string): LinkState[Key] | undefined {
  switch (key) {
    case 'area':
      return oneOf(AREAS, v);
    case 'cam':
      return parseCam(v);
    case 'weather':
      return oneOf(weatherModes, v);
    case 'tod':
      return oneOf(['auto', 'day', 'night'] as const, v);
    case 'speed':
      return oneOf(SPEEDS, v);
    case 'labels':
      return v === '1' ? true : v === '0' ? false : undefined;
    case 'theme':
      return oneOf(['dark', 'light'] as const, v);
    case 'quality':
      return oneOf(['auto', 0, 1, 2] as const, v);
    case 'seed':
      return SEED.test(v) ? v : undefined;
    case 'preset':
      return oneOf(PRESETS, v);
    case 'select':
      return SELECTABLE.has(v) ? v : undefined;
    case 'kiosk':
    case 'embed':
      return v === '1' ? true : undefined;
  }
}

const isKey = (k: string): k is Key => (KEYS as readonly string[]).includes(k);

/** Parses a query string ("?a=b&…" or "a=b&…"). Never throws. */
export function parseLink(search: string): ParsedLink {
  const state: Partial<Record<Key, unknown>> = {};
  const ignored: string[] = [];
  const seen = new Set<string>();
  // URLSearchParams drops one leading "?" and never throws on malformed escapes.
  for (const [key, value] of new URLSearchParams(search)) {
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    const parsed = isKey(key) ? parseValue(key, value) : undefined;
    if (parsed === undefined || !isKey(key)) ignored.push(key);
    else state[key] = parsed;
  }
  return { state: state as Partial<LinkState>, ignored };
}

/** Rounded to 0.1, without a trailing ".0" or a "-0". */
const num = (v: number): string => String(Math.round(v * 10) / 10 || 0);

function formatValue(key: Key, state: LinkState): string {
  if (key === 'cam' && state.cam) {
    const c = state.cam;
    // Plain commas keep the link readable; they are valid in a query.
    return [c.x, c.z, c.azimuthDeg, c.elevationDeg, c.distance].map(num).join(',');
  }
  const v = state[key];
  if (typeof v === 'boolean') return v ? '1' : '0';
  return typeof v === 'string' || typeof v === 'number' ? encodeURIComponent(String(v)) : '';
}

/** The link for `state` on `base` (origin + path); default values are left out, keys in a fixed order. */
export function formatLink(base: string, state: LinkState): string {
  const parts: string[] = [];
  for (const key of KEYS) {
    const v = state[key];
    if (v === null || v === LINK_DEFAULTS[key]) continue;
    parts.push(`${key}=${formatValue(key, state)}`);
  }
  return parts.length > 0 ? `${base}?${parts.join('&')}` : base;
}

/** Link speed → steps per tick. */
export function toSpeed(link: SpeedLink): Speed {
  const i = SPEEDS.indexOf(link);
  return i === 0 || i === 1 || i === 2 || i === 3 ? i : 1;
}

/** Steps per tick → link speed. */
export function toSpeedLink(speed: Speed): SpeedLink {
  return SPEEDS[speed] ?? 15;
}
