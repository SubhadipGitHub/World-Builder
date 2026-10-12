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

const STATIONS: Readonly<Record<string, string>> = {
  wash: 'Wash',
  service: 'Service',
  charger: 'EV charger',
  pump: 'Fuel pump',
  slot: 'Ready lot',
  gate: 'Exit gate',
};

export function createAlertFeed(max = 50): AlertFeed {
  let alerts: Alert[] = [];
  let unread = 0;
  let counter = 0;
  const lowEvs = new Set<string>();

  const push = (severity: AlertSeverity, message: string, vehicleId: string | null, simTimeSec: number): void => {
    alerts.unshift({ id: `alert-${String(++counter)}`, severity, message, vehicleId, simTimeSec });
    if (alerts.length > max) alerts = alerts.slice(0, max);
    unread++;
  };

  return {
    ingest(events) {
      for (const e of events) {
        switch (e.type) {
          case 'maintenanceFlagged':
            if (e.severe) push('critical', `Severe damage on ${e.vehicleId} — tow requested`, e.vehicleId, e.simTimeSec);
            else push('warning', `Maintenance: ${e.reason} on ${e.vehicleId}`, e.vehicleId, e.simTimeSec);
            break;
          case 'towDispatched':
            push('info', `Tow truck dispatched for ${e.vehicleId}`, e.vehicleId, e.simTimeSec);
            break;
          case 'queueOverflow':
            push('warning', `${STATIONS[e.resource] ?? e.resource} queue at ${String(e.length)} cars`, null, e.simTimeSec);
            break;
          default:
            break;
        }
      }
    },
    observeSnapshot(snapshot, threshold) {
      const lowNow = new Set<string>();
      for (const a of snapshot.agents) {
        if (a.kind !== 'fleet' || a.cls !== 'ev' || a.state !== 'staged' || a.socPct === null || a.socPct >= threshold) continue;
        lowNow.add(a.id);
        if (!lowEvs.has(a.id)) push('warning', `${a.id} staged at ${String(Math.round(a.socPct))}% charge`, a.id, snapshot.simTimeSec);
      }
      lowEvs.clear();
      for (const id of lowNow) lowEvs.add(id);
    },
    list: () => alerts,
    unread: () => Math.min(unread, alerts.length),
    markAllRead() {
      unread = 0;
    },
  };
}
