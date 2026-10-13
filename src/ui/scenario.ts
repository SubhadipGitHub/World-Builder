import { CREW_STATIONS, OUTAGE_KINDS, deltaLingerSimSec, noiseBand, presets, revenueNoiseShare, type CrewLevel, type CrewStation, type OutageKind, type PresetId } from '../config/scenarios';
import type { WeatherMode } from '../config/weather';
import type { ScenarioCommand, ScenarioView } from '../sim/scenario';
import type { Snapshot } from '../sim/world';
import { hub } from '../layout/hub';
import { formatMoneyShort, unitLabel } from './format';
import type { KpiId } from './kpis';
import type { OutageGroup } from './m4/WhatIfDrawer';

// App-side scenario helpers (architecture §17, W8, W10), all pure.

/** A preset expanded into simulation commands (S-4). `weather` goes to the visible simulation only. */
export interface PresetPlan {
  readonly commands: readonly ScenarioCommand[];
  readonly weather?: WeatherMode;
}

/**
 * Expands a preset. It starts from normal (a resetScenario command first), so presets don't stack,
 * then adds its surge, outages and crew levels, in that order.
 */
export function presetCommands(id: PresetId): PresetPlan {
  const preset = presets.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset ${id}`);
  const { surge, offline = [], crews = {}, weather } = preset.levers;
  const commands: ScenarioCommand[] = [{ type: 'resetScenario' }];
  if (surge) commands.push({ type: 'surge' });
  for (const unitId of offline) commands.push({ type: 'setUnitOnline', unitId, online: false });
  for (const station of CREW_STATIONS) {
    const level = crews[station];
    if (level) commands.push({ type: 'setCrew', station, level });
  }
  return weather ? { commands, weather } : { commands };
}

/** Remembers the weather a preset replaced, so Reset can restore it (S-5, W8). */
export interface WeatherMemory {
  /** A preset is about to set `presetWeather` while `current` is in force. */
  onPreset(current: WeatherMode, presetWeather: WeatherMode | undefined): void;
  /** The user picked a weather from the menu: their choice wins, so the memory is cleared. */
  onManualWeather(): void;
  /** Weather to restore on Reset (null = leave as is); clears the memory. */
  takeRestore(): WeatherMode | null;
}

export function createWeatherMemory(): WeatherMemory {
  let saved: WeatherMode | null = null;
  return {
    onPreset(current, presetWeather) {
      if (presetWeather !== undefined && saved === null) saved = current;
    },
    onManualWeather() {
      saved = null;
    },
    takeRestore() {
      const w = saved;
      saved = null;
      return w;
    },
  };
}

export type DeltaTone = 'good' | 'bad' | 'neutral';

export interface KpiDelta {
  /** e.g. "+12 min vs normal", "−3 pts vs normal", "≈ normal". */
  readonly text: string;
  readonly tone: DeltaTone;
}

/**
 * Delta of one KPI against the baseline (S-12, S-13). Values are minutes (turnaround) or percent
 * (utilisation 0–100, EV SoC 0–100). Inside the noise band → "≈ normal" (neutral). Turnaround up
 * is bad; utilisation and EV SoC up are good. Null when either value is unknown.
 */
export function kpiDelta(id: KpiId, scenario: number | null, baseline: number | null): KpiDelta | null {
  if (scenario === null || baseline === null) return null;
  const d = scenario - baseline;
  if (id === 'revenue') {
    // FE-8, F22: dollars, up is good; noise is the larger of $500 and 3% of the baseline.
    if (Math.abs(d) < Math.max(noiseBand.revenue, revenueNoiseShare * Math.abs(baseline))) return { text: '≈ normal', tone: 'neutral' };
    return { text: `${formatMoneyShort(d)} vs normal`, tone: d > 0 ? 'good' : 'bad' };
  }
  if (Math.abs(d) < noiseBand[id]) return { text: '≈ normal', tone: 'neutral' };
  const n = Math.round(Math.abs(d));
  const sign = d > 0 ? '+' : '−';
  const unit = id === 'turnaround' ? 'min' : 'pts';
  const upIsGood = id !== 'turnaround';
  return { text: `${sign}${String(n)} ${unit} vs normal`, tone: d > 0 === upIsGood ? 'good' : 'bad' };
}

/** Deltas show while a scenario is active and for 60 simulated minutes after it returns to normal (S-12). */
export function deltaVisible(view: ScenarioView, nowSimSec: number): boolean {
  if (view.active) return true;
  return view.lastChangeAt !== null && nowSimSec - view.lastChangeAt < deltaLingerSimSec;
}

export type QueueKey = 'returnLane' | 'wash' | 'service' | 'charger' | 'gate';

/** Cars waiting per station (S-14), from a snapshot's resources. Fuel pumps are not listed. */
export function queueSummary(snapshot: Snapshot): Readonly<Record<QueueKey, number>> {
  const out: Record<QueueKey, number> = { returnLane: 0, wash: 0, service: 0, charger: 0, gate: 0 };
  for (const r of snapshot.resources) {
    // Every unit of a station reports the station's shared queue.
    if (r.kind in out) out[r.kind as QueueKey] = Math.max(out[r.kind as QueueKey], r.queueLength);
  }
  return out;
}

/** Top-bar chips (S-7), e.g. ["Surge 42 min", "2 units offline", "Wash: short"]; empty when normal. */
export function scenarioChips(view: ScenarioView): readonly string[] {
  const chips: string[] = [];
  if (view.surgeRemainingSec !== null) chips.push(`Surge ${String(Math.ceil(view.surgeRemainingSec / 60))} min`);
  const n = view.offline.length;
  if (n > 0) chips.push(`${String(n)} ${n === 1 ? 'unit' : 'units'} offline`);
  for (const station of CREW_STATIONS) {
    const level = view.crews[station];
    if (level !== 'normal') chips.push(`${CREW_LABEL[station]}: ${LEVEL_LABEL[level].toLowerCase()}`);
  }
  return chips;
}

/** Display names for crew stations and levels. */
export const CREW_LABEL: Readonly<Record<CrewStation, string>> = { inspection: 'Inspection', wash: 'Wash', service: 'Service' };
export const LEVEL_LABEL: Readonly<Record<CrewLevel, string>> = { short: 'Short-staffed', normal: 'Normal', extra: 'Extra crew' };

const GROUP_LABEL: Readonly<Record<OutageKind, string>> = {
  returnLane: 'Return lanes',
  wash: 'Wash bays',
  service: 'Service bays',
  charger: 'EV chargers',
  pump: 'Fuel pumps',
  gate: 'Exit gates',
};
const UNIT_NOUN: Readonly<Record<OutageKind, string>> = {
  returnLane: 'return lane',
  wash: 'wash bay',
  service: 'service bay',
  charger: 'EV charger',
  pump: 'fuel pump',
  gate: 'exit gate',
};

const kindOfUnit = new Map<string, OutageKind>(OUTAGE_KINDS.flatMap((k) => hub.stations[k].units.map((u) => [u.id, k] as const)));

/** Outage-able units grouped by station, for the What-if drawer (S-6). */
export function outageGroups(): readonly OutageGroup[] {
  return OUTAGE_KINDS.map((kind) => ({
    kind,
    label: GROUP_LABEL[kind],
    units: hub.stations[kind].units.map((u) => ({ id: u.id, label: unitLabel(u.id) })),
  }));
}

/** True for return lanes, bays, chargers, pumps and gates (S-2). */
export const isOutageable = (unitId: string): boolean => kindOfUnit.has(unitId);

/**
 * Why an online unit cannot be taken offline (the last-unit rule, S-2), or null when it can, when it
 * is already offline, or when it can't have outages at all. Mirrors `canTakeOffline` in the simulation.
 */
export function offlineReason(view: ScenarioView, unitId: string): string | null {
  const kind = kindOfUnit.get(unitId);
  if (!kind || view.offline.includes(unitId)) return null;
  const open = hub.stations[kind].units.filter((u) => !view.offline.includes(u.id)).length;
  return open <= 1 ? `At least one ${UNIT_NOUN[kind]} must stay open` : null;
}
