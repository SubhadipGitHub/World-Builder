import { notImplemented } from '../shared/notImplemented';
import type { TrackerStage, VehicleState } from '../sim/lifecycle';
import type { AgentKind, VehicleClass } from '../sim/types';

const DASH = '—';
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "—" for null; "45 s" under a minute; "12 min" under an hour; "1 h 05 min" above. */
export function formatDuration(simSec: number | null): string {
  if (simSec === null) return DASH;
  const s = Math.max(0, simSec);
  if (s < 60) return `${String(Math.floor(s))} s`;
  if (s < 3600) return `${String(Math.floor(s / 60))} min`;
  return `${String(Math.floor(s / 3600))} h ${pad2(Math.floor((s % 3600) / 60))} min`;
}

/** "82%" (rounded); "—" for null. */
export function formatPercent(value: number | null): string {
  return value === null ? DASH : `${String(Math.round(value))}%`;
}

/** "12,345 mi"; "—" for null. */
export function formatMiles(miles: number | null): string {
  return miles === null ? DASH : `${Math.round(miles).toLocaleString('en-US')} mi`;
}

/** Metres per second → "19 mph". */
export function formatSpeed(metresPerSecond: number): string {
  return `${String(Math.round(metresPerSecond * 2.236936))} mph`;
}

/** Hours in [0, 24) → "08:05". */
export function formatClock(hours: number): string {
  const minutes = Math.floor(hours * 60 + 1e-6);
  return `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`;
}

const STATES: Readonly<Record<VehicleState, string>> = {
  onRent: 'On rent',
  arriving: 'Arriving',
  inspecting: 'Inspecting',
  awaitingTow: 'Waiting for tow',
  beingTowed: 'Being towed',
  washQueue: 'Queued for wash',
  washing: 'Washing',
  serviceQueue: 'Queued for service',
  inService: 'In service',
  energyQueue: 'Queued for charge / fuel',
  energising: 'Charging / refuelling',
  toLot: 'Heading to Ready lot',
  staged: 'Ready for rent',
  departing: 'Departing',
};

/** Human label for a lifecycle state, e.g. 'energising' → "Charging / refuelling". */
export function stateLabel(state: VehicleState): string {
  return STATES[state];
}

const STAGES: Readonly<Record<TrackerStage, string>> = {
  returned: 'Returned',
  inspected: 'Inspected',
  washed: 'Washed & detailed',
  energised: 'Refuelled / charged',
  staged: 'Staged',
  dispatched: 'Dispatched',
};

/** Tracker label, e.g. 'energised' → "Refuelled / charged" (requirements §3). */
export function stageLabel(stage: TrackerStage): string {
  return STAGES[stage];
}

const CLASSES: Readonly<Record<VehicleClass, string>> = {
  ev: 'Compact EV crossover',
  suv: 'Full-size SUV',
  sedan: 'Mid-size sedan',
  economy: 'Economy hatchback',
  luxury: 'Premium saloon',
  minivan: '7-seat minivan',
  pickup: 'Crew-cab pickup',
};

/** Brand-neutral model names (N-7), e.g. 'ev' → "Compact EV crossover". */
export function classLabel(cls: VehicleClass): string {
  return CLASSES[cls];
}

const KINDS: Readonly<Record<AgentKind, string>> = {
  fleet: 'Fleet vehicle',
  shuttle: 'Shuttle bus',
  cart: 'Technician cart',
  tow: 'Tow truck',
  van: 'Service van',
  pedestrian: 'Customer',
};

/** e.g. 'tow' → "Tow truck". */
export function kindLabel(kind: AgentKind): string {
  return KINDS[kind];
}

const UNIT_PREFIXES: readonly [RegExp, string][] = [
  [/^lane(\d+)$/, 'Return lane'],
  [/^wash(\d+)$/, 'Wash bay'],
  [/^bay(\d+)$/, 'Service bay'],
  [/^charger(\d+)$/, 'EV charger'],
  [/^pump(\d+)$/, 'Fuel pump'],
  [/^gate(\d+)$/, 'Exit gate'],
];

/** Unit ids to labels: "wash2" → "Wash bay 2", "charger3" → "EV charger 3", "ev-04" → "Ready slot EV-04". */
export function unitLabel(unitId: string): string {
  for (const [pattern, label] of UNIT_PREFIXES) {
    const m = pattern.exec(unitId);
    if (m?.[1]) return `${label} ${m[1]}`;
  }
  if (/^towbay\d*$/.test(unitId)) return 'Tow bay';
  const slot = /^(ev|suv|sedan)-(\d+)$/.exec(unitId);
  if (slot?.[1] && slot[2]) return `Ready slot ${slot[1].toUpperCase()}-${slot[2]}`;
  return unitId;
}

/** US$ with thousands separators and no cents (FE-8), e.g. 18420 → "$18,420". */
export function formatMoney(usd: number): string {
  return notImplemented(usd);
}

/** Short signed US$ for deltas (FE-8), e.g. −2140 → "−$2.1k", 640 → "+$640". */
export function formatMoneyShort(usd: number): string {
  return notImplemented(usd);
}
