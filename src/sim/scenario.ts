import { CREW_STATIONS, OUTAGE_KINDS, crewFactor, surge, type CrewLevel, type CrewStation, type OutageKind } from '../config/scenarios';

/** Scenario state held inside the simulation (architecture §17, W1). Times are simulated seconds. */
export interface ScenarioState {
  /** Unit ids currently offline. */
  readonly offline: ReadonlySet<string>;
  readonly crews: Readonly<Record<CrewStation, CrewLevel>>;
  /** End of the current surge window, or null. */
  readonly surgeUntil: number | null;
  /** When any lever last changed (start, end or reset); null if never. Drives the delta window (S-12). */
  readonly lastChangeAt: number | null;
}

export type ScenarioCommand =
  | { readonly type: 'surge' }
  | { readonly type: 'setUnitOnline'; readonly unitId: string; readonly online: boolean }
  | { readonly type: 'setCrew'; readonly station: CrewStation; readonly level: CrewLevel }
  | { readonly type: 'resetScenario' };

export type ScenarioChange = 'surgeStarted' | 'surgeEnded' | 'unitOffline' | 'unitOnline' | 'crewChanged' | 'reset' | 'rejected';

export interface ScenarioEvent {
  readonly type: 'scenario';
  readonly change: ScenarioChange;
  readonly unitId?: string;
  readonly station?: CrewStation;
  readonly level?: CrewLevel;
  readonly simTimeSec: number;
}

/** Plain, structured-clone-safe view for snapshots (A1). */
export interface ScenarioView {
  /** Sorted unit ids. */
  readonly offline: readonly string[];
  readonly crews: Readonly<Record<CrewStation, CrewLevel>>;
  /** Seconds of surge left, or null when no surge is running. */
  readonly surgeRemainingSec: number | null;
  /** True while any lever differs from normal. */
  readonly active: boolean;
  readonly lastChangeAt: number | null;
}

/** Which station kind a unit belongs to, for the outage rules. */
export interface UnitCatalogue {
  /** Kind of the unit, or null if unknown or not outage-able (slots, tow bay). */
  kindOf(unitId: string): OutageKind | null;
  /** Every unit id of that kind. */
  unitsOf(kind: OutageKind): readonly string[];
}

/** Builds a catalogue from unit ids per outage kind (the simulation passes the hub's stations). */
export function createUnitCatalogue(units: Readonly<Partial<Record<OutageKind, readonly string[]>>>): UnitCatalogue {
  const kinds = new Map<string, OutageKind>();
  for (const kind of OUTAGE_KINDS) for (const id of units[kind] ?? []) kinds.set(id, kind);
  return {
    kindOf: (unitId) => kinds.get(unitId) ?? null,
    unitsOf: (kind) => units[kind] ?? [],
  };
}

export interface ReduceContext {
  readonly now: number;
  readonly units: UnitCatalogue;
}

export interface ReduceResult {
  readonly state: ScenarioState;
  readonly events: readonly ScenarioEvent[];
  /** Units whose online flag changed: the caller mirrors these into the resource pools. */
  readonly toggled: readonly { readonly unitId: string; readonly online: boolean }[];
  /** True when a surge was (re)started: the caller pulls rentals forward. */
  readonly surgeStarted: boolean;
}

export const NORMAL_SCENARIO: ScenarioState = {
  offline: new Set<string>(),
  crews: { inspection: 'normal', wash: 'normal', service: 'normal' },
  surgeUntil: null,
  lastChangeAt: null,
};

const NO_TOGGLES: ReduceResult['toggled'] = [];

const unchanged = (state: ScenarioState): ReduceResult => ({ state, events: [], toggled: NO_TOGGLES, surgeStarted: false });

const isNormal = (s: ScenarioState): boolean =>
  s.offline.size === 0 && s.surgeUntil === null && CREW_STATIONS.every((c) => s.crews[c] === 'normal');

/**
 * Applies one command (S-1…S-5). Invalid commands (unknown unit, non-outage-able unit, the last
 * online unit of a station) leave the state unchanged and emit a 'rejected' event. Commands that
 * change nothing (a toggle or crew level already in force, a reset while normal) emit nothing.
 */
export function reduceScenario(state: ScenarioState, command: ScenarioCommand, ctx: ReduceContext): ReduceResult {
  const now = ctx.now;
  switch (command.type) {
    case 'surge':
      return {
        state: { ...state, surgeUntil: now + surge.durationSimSec, lastChangeAt: now },
        events: [{ type: 'scenario', change: 'surgeStarted', simTimeSec: now }],
        toggled: NO_TOGGLES,
        surgeStarted: true,
      };
    case 'setUnitOnline': {
      const { unitId, online } = command;
      const rejected: ReduceResult = {
        state,
        events: [{ type: 'scenario', change: 'rejected', unitId, simTimeSec: now }],
        toggled: NO_TOGGLES,
        surgeStarted: false,
      };
      if (ctx.units.kindOf(unitId) === null) return rejected;
      if (online !== state.offline.has(unitId)) return unchanged(state);
      if (!online && !canTakeOffline(state, unitId, ctx.units)) return rejected;
      const offline = new Set(state.offline);
      if (online) offline.delete(unitId);
      else offline.add(unitId);
      return {
        state: { ...state, offline, lastChangeAt: now },
        events: [{ type: 'scenario', change: online ? 'unitOnline' : 'unitOffline', unitId, simTimeSec: now }],
        toggled: [{ unitId, online }],
        surgeStarted: false,
      };
    }
    case 'setCrew': {
      const { station, level } = command;
      if (state.crews[station] === level) return unchanged(state);
      return {
        state: { ...state, crews: { ...state.crews, [station]: level }, lastChangeAt: now },
        events: [{ type: 'scenario', change: 'crewChanged', station, level, simTimeSec: now }],
        toggled: NO_TOGGLES,
        surgeStarted: false,
      };
    }
    case 'resetScenario':
      if (isNormal(state)) return unchanged(state);
      return {
        state: { ...NORMAL_SCENARIO, lastChangeAt: now },
        events: [{ type: 'scenario', change: 'reset', simTimeSec: now }],
        toggled: [...state.offline].map((unitId) => ({ unitId, online: true })),
        surgeStarted: false,
      };
  }
}

/** Ends an expired surge (call once per step); emits 'surgeEnded' exactly once. */
export function tickScenario(state: ScenarioState, now: number): { readonly state: ScenarioState; readonly events: readonly ScenarioEvent[] } {
  if (state.surgeUntil === null || now < state.surgeUntil) return { state, events: [] };
  return { state: { ...state, surgeUntil: null, lastChangeAt: now }, events: [{ type: 'scenario', change: 'surgeEnded', simTimeSec: now }] };
}

/** The last-unit rule (S-2, W4): false for unknown units, already-offline units, or the last online unit of its kind. */
export function canTakeOffline(state: ScenarioState, unitId: string, units: UnitCatalogue): boolean {
  const kind = units.kindOf(unitId);
  if (kind === null || state.offline.has(unitId)) return false;
  return units.unitsOf(kind).filter((id) => !state.offline.has(id)).length > 1;
}

/** Job-duration multiplier for a crew station (S-3). */
export function durationFactor(state: ScenarioState, station: CrewStation): number {
  return crewFactor[state.crews[station]];
}

const surging = (state: ScenarioState, now: number): boolean => state.surgeUntil !== null && now < state.surgeUntil;

/** Pickup demand multiplier at time `now` (S-1): ×2 inside the surge window, else 1. */
export function pickupFactor(state: ScenarioState, now: number): number {
  return surging(state, now) ? surge.pickupFactor : 1;
}

/** True while any lever differs from normal. */
export function isActive(state: ScenarioState, now: number): boolean {
  return state.offline.size > 0 || surging(state, now) || CREW_STATIONS.some((c) => state.crews[c] !== 'normal');
}

export function scenarioView(state: ScenarioState, now: number): ScenarioView {
  return {
    offline: [...state.offline].sort(),
    crews: { ...state.crews },
    surgeRemainingSec: surging(state, now) ? (state.surgeUntil as number) - now : null,
    active: isActive(state, now),
    lastChangeAt: state.lastChangeAt,
  };
}
