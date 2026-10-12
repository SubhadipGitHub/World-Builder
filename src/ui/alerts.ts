import { notImplemented } from '../shared/notImplemented';
import type { SimEvent } from '../sim/events';
import type { Snapshot } from '../sim/world';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  /** Unique, stable id. */
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly message: string;
  /** Vehicle to select when the alert is clicked, if any. */
  readonly vehicleId: string | null;
  readonly simTimeSec: number;
}

/**
 * Alerts from the simulation (D-8), newest first, capped at `max`:
 *  - maintenanceFlagged → warning "Maintenance: <reason> on <id>"; severe → critical "Severe damage on <id> — tow requested"
 *  - towDispatched → info "Tow truck dispatched for <id>"
 *  - queueOverflow → warning "<Station> queue at <n> cars" (e.g. "Wash queue at 7 cars")
 *  - an EV staged below the SoC threshold (snapshot check, once per vehicle per stay) → warning "<id> staged at <n>% charge"
 */
export interface AlertFeed {
  ingest(events: readonly SimEvent[]): void;
  observeSnapshot(snapshot: Snapshot, socThresholdPct: number): void;
  list(): readonly Alert[];
  unread(): number;
  markAllRead(): void;
}

export function createAlertFeed(max?: number): AlertFeed {
  return notImplemented(max);
}
