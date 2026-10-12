import { notImplemented } from '../shared/notImplemented';
import type { Tier } from '../config/brand';
import type { SimEvent } from '../sim/events';
import type { Snapshot } from '../sim/world';

export interface FleetRow {
  readonly id: string;
  /** Brand-neutral model name. */
  readonly model: string;
  readonly status: string;
  /** "Battery 64%" or "Fuel 37%". */
  readonly energy: string;
  /** Area label, e.g. "EV charging & fuel". */
  readonly location: string;
}

export interface QueueRow {
  /** Unit id, for selection. */
  readonly unitId: string;
  /** e.g. "Wash bay 2". */
  readonly bay: string;
  readonly vehicleId: string;
  /** "Inspection", "Wash", "Service", "Charging", "Refuelling". */
  readonly service: string;
  /** e.g. "3 min"; "—" when unknown. */
  readonly remaining: string;
}

export interface CheckoutRow {
  readonly agreementNo: string;
  readonly vehicleId: string;
  readonly tier: Tier;
  /** e.g. "Exit gate 1". */
  readonly gate: string;
  readonly simTimeSec: number;
}

/** Active fleet tab (D-6): every fleet car on the map, sorted by id. */
export function fleetRows(snapshot: Snapshot): readonly FleetRow[] {
  return notImplemented(snapshot);
}

/** Turnaround & service queue tab (D-6): occupied inspection, wash, service, charger and pump units, by bay. */
export function queueRows(snapshot: Snapshot): readonly QueueRow[] {
  return notImplemented(snapshot);
}

/** Customer checkout log (D-6): checkout events, newest first, capped at `max` (default 50). */
export interface CheckoutLog {
  ingest(events: readonly SimEvent[]): void;
  rows(): readonly CheckoutRow[];
}

export function createCheckoutLog(max?: number): CheckoutLog {
  return notImplemented(max);
}
