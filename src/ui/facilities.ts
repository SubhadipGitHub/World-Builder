import { brand } from '../config/brand';
import type { StationId } from '../layout/hub';
import { notImplemented } from '../shared/notImplemented';
import type { Snapshot } from '../sim/world';

// Building indicators (requirements I-1…I-4, architecture §18 G8). Pure.

export type FacilityId = 'return' | 'wash' | 'service' | 'evHub' | 'fuel' | 'lot' | 'gates' | 'terminal';
export type FacilityState = 'ok' | 'busy' | 'offline';

export interface Facility {
  readonly id: FacilityId;
  readonly name: string;
  /** hub.buildings id the label floats above. */
  readonly building: string;
  /** Stations whose units this facility reports; empty for the terminal. */
  readonly stations: readonly StationId[];
  /** Label height above the ground (metres). */
  readonly labelY: number;
  /** Higher wins when labels overlap (I-4). */
  readonly priority: number;
  /** Camera distance when flying to it (Q2). */
  readonly distance: number;
}

export const FACILITIES: readonly Facility[] = [
  { id: 'return', name: 'Rental Car Return', building: 'canopy', stations: ['returnLane'], labelY: 12, priority: 6, distance: 120 },
  { id: 'wash', name: 'Express Wash', building: 'wash', stations: ['wash'], labelY: 11, priority: 6, distance: 110 },
  { id: 'service', name: 'Service Center', building: 'service', stations: ['service'], labelY: 13, priority: 5, distance: 120 },
  { id: 'evHub', name: 'EV Fast Charge', building: 'evHub', stations: ['charger'], labelY: 10, priority: 5, distance: 120 },
  { id: 'fuel', name: 'Fuel', building: 'fuel', stations: ['pump'], labelY: 10, priority: 4, distance: 110 },
  { id: 'gates', name: 'Exit Gates', building: 'gates', stations: ['gate'], labelY: 9, priority: 4, distance: 110 },
  { id: 'lot', name: 'Ready Lot', building: 'lot', stations: ['slot'], labelY: 8, priority: 2, distance: 200 },
  { id: 'terminal', name: brand.company, building: 'terminal', stations: [], labelY: 22, priority: 1, distance: 160 },
];

/** A queue this long makes a facility Busy (I-2). */
export const BUSY_QUEUE = 3;
/** Camera distance beyond which labels show only name and status (I-4). */
export const COMPACT_DISTANCE = 350;

export interface FacilityStatus {
  readonly id: FacilityId;
  readonly name: string;
  readonly state: FacilityState;
  /** Occupied units / all units (Ready lot: staged cars / slots). */
  readonly busy: number;
  readonly total: number;
  readonly queue: number;
  readonly offline: number;
  /** "2/3 busy · queue 4", "18/48 staged", "Counter: 3 waiting", "1 offline · 1/1 busy · queue 2". */
  readonly detail: string;
}

/** Live status of every facility, in FACILITIES order (I-1, I-2, I-3). */
export function facilityStatuses(snapshot: Snapshot): readonly FacilityStatus[] {
  return notImplemented(snapshot);
}

/** Status word shown next to the dot. */
export const STATE_LABEL: Readonly<Record<FacilityState, string>> = { ok: 'OK', busy: 'Busy', offline: 'Offline' };

/** Accessible name, e.g. "Express Wash, Busy, 2 of 2 busy, queue 4". */
export function labelName(status: FacilityStatus): string {
  return notImplemented(status);
}

export interface LabelRect {
  readonly id: FacilityId;
  readonly priority: number;
  /** Screen rect in CSS pixels. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Ids to show: higher priority first (ties by FACILITIES order); a label overlapping a shown one hides. */
export function declutter(rects: readonly LabelRect[]): ReadonlySet<FacilityId> {
  return notImplemented(rects);
}
