import type { SimEvent } from '../sim/events';
import type { ScenarioEvent } from '../sim/scenario';
import type { Snapshot } from '../sim/world';
import { unitLabel } from './format';
import { CREW_LABEL, LEVEL_LABEL } from './scenario';

export type AlertSeverity = 'info' | 'warning' | 'critical';

/** What raised the alert (M9, F20): the toast merge key and the chime choice. */
export type AlertKind = 'maintenance' | 'service' | 'tow' | 'queue' | 'lowSoc' | 'scenario';

export interface Alert {
  /** Unique, stable id. */
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly kind: AlertKind;
  readonly message: string;
  /** Vehicle to select when the alert is clicked, if any. */
  readonly vehicleId: string | null;
  /** Unit to select when the alert is clicked (scenario alerts, S-9), if any. */
  readonly unitId: string | null;
  readonly simTimeSec: number;
}

/**
 * Alerts from the simulation (D-8), newest first, capped at `max`:
 *  - maintenanceFlagged → warning "Maintenance: <reason> on <id>"; severe → critical "Severe damage on <id> — tow requested"
 *  - towDispatched → info "Tow truck dispatched for <id>"
 *  - queueOverflow → warning "<Station> queue at <n> cars" (e.g. "Wash queue at 7 cars")
 *  - an EV staged below the SoC threshold (snapshot check, once per vehicle per stay) → warning "<id> staged at <n>% charge"
 *  - scenario (S-9), info, with unitId for unit changes: unitOffline "<Unit> taken offline"; unitOnline "<Unit> back online";
 *    surgeStarted "Surge: flight bank landed"; surgeEnded "Surge ended"; crewChanged "<Station> crew: <short-staffed|normal|extra crew>";
 *    reset "Scenario reset to normal"; rejected is not shown
 */
export interface AlertFeed {
  /** Returns the alerts this call created, oldest first (M9: fed to the toasts). */
  ingest(events: readonly SimEvent[]): readonly Alert[];
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

/** Wording for scenario alerts (S-9); null for events that are not shown. */
function scenarioMessage(e: ScenarioEvent): string | null {
  switch (e.change) {
    case 'surgeStarted':
      return 'Surge: flight bank landed';
    case 'surgeEnded':
      return 'Surge ended';
    case 'unitOffline':
      return `${unitLabel(e.unitId ?? '')} taken offline`;
    case 'unitOnline':
      return `${unitLabel(e.unitId ?? '')} back online`;
    case 'crewChanged':
      return e.station && e.level ? `${CREW_LABEL[e.station]} crew: ${LEVEL_LABEL[e.level].toLowerCase()}` : null;
    case 'reset':
      return 'Scenario reset to normal';
    case 'rejected':
      return null;
  }
}

export function createAlertFeed(max = 50): AlertFeed {
  let alerts: Alert[] = [];
  let unread = 0;
  let counter = 0;
  const lowEvs = new Set<string>();

  const push = (severity: AlertSeverity, kind: AlertKind, message: string, vehicleId: string | null, simTimeSec: number, unitId: string | null = null): void => {
    alerts.unshift({ id: `alert-${String(++counter)}`, severity, kind, message, vehicleId, unitId, simTimeSec });
    if (alerts.length > max) alerts = alerts.slice(0, max);
    unread++;
  };

  return {
    ingest(events) {
      for (const e of events) {
        switch (e.type) {
          case 'maintenanceFlagged':
            if (e.severe) push('critical', 'maintenance', `Severe damage on ${e.vehicleId} — tow requested`, e.vehicleId, e.simTimeSec);
            else push('warning', 'maintenance', `Maintenance: ${e.reason} on ${e.vehicleId}`, e.vehicleId, e.simTimeSec);
            break;
          case 'towDispatched':
            push('info', 'tow', `Tow truck dispatched for ${e.vehicleId}`, e.vehicleId, e.simTimeSec);
            break;
          case 'queueOverflow':
            push('warning', 'queue', `${STATIONS[e.resource] ?? e.resource} queue at ${String(e.length)} cars`, null, e.simTimeSec);
            break;
          case 'scenario': {
            const message = scenarioMessage(e);
            if (message) push('info', 'scenario', message, null, e.simTimeSec, e.unitId ?? null);
            break;
          }
          default:
            break;
        }
      }
      return []; // Stage 3 placeholder (M9): Stage 4 returns the alerts created by this call.
    },
    observeSnapshot(snapshot, threshold) {
      const lowNow = new Set<string>();
      for (const a of snapshot.agents) {
        if (a.kind !== 'fleet' || a.cls !== 'ev' || a.state !== 'staged' || a.socPct === null || a.socPct >= threshold) continue;
        lowNow.add(a.id);
        if (!lowEvs.has(a.id)) push('warning', 'lowSoc', `${a.id} staged at ${String(Math.round(a.socPct))}% charge`, a.id, snapshot.simTimeSec);
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
