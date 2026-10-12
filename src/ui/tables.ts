import type { Tier } from '../config/brand';
import { areaById, areaOf } from '../layout/positions';
import type { SimEvent } from '../sim/events';
import type { ResourceKind, Snapshot } from '../sim/world';
import { classLabel, formatDuration, formatPercent, stateLabel, unitLabel } from './format';

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

/** Area label for a position; outside every named area the car is on the access roads. */
const locationLabel = (x: number, z: number): string => {
  const id = areaOf(x, z);
  return id === 'overview' ? 'On hub roads' : areaById(id).label;
};

/** Active fleet tab (D-6): every fleet car on the map, sorted by id. */
export function fleetRows(snapshot: Snapshot): readonly FleetRow[] {
  return snapshot.agents
    .filter((a) => a.kind === 'fleet' && a.cls !== null)
    .map((a) => ({
      id: a.id,
      model: a.cls ? classLabel(a.cls) : '—',
      status: a.state ? stateLabel(a.state) : '—',
      energy: a.cls === 'ev' ? `Battery ${formatPercent(a.socPct)}` : `Fuel ${formatPercent(a.fuelPct)}`,
      location: locationLabel(a.x, a.z),
    }))
    .sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

const SERVICES: Partial<Record<ResourceKind, string>> = {
  returnLane: 'Inspection',
  wash: 'Wash',
  service: 'Service',
  charger: 'Charging',
  pump: 'Refuelling',
};

/** Turnaround & service queue tab (D-6): occupied inspection, wash, service, charger and pump units, by bay. */
export function queueRows(snapshot: Snapshot): readonly QueueRow[] {
  const agents = new Map(snapshot.agents.map((a) => [a.id, a]));
  const rows: QueueRow[] = [];
  for (const r of snapshot.resources) {
    const service = SERVICES[r.kind];
    if (!service || r.occupantId === null) continue;
    rows.push({
      unitId: r.id,
      bay: unitLabel(r.id),
      vehicleId: r.occupantId,
      service,
      remaining: formatDuration(agents.get(r.occupantId)?.etaSimSec ?? null),
    });
  }
  return rows;
}

/** Customer checkout log (D-6): checkout events, newest first, capped at `max` (default 50). */
export interface CheckoutLog {
  ingest(events: readonly SimEvent[]): void;
  rows(): readonly CheckoutRow[];
}

export function createCheckoutLog(max = 50): CheckoutLog {
  let rows: CheckoutRow[] = [];
  return {
    ingest(events) {
      for (const e of events) {
        if (e.type !== 'checkout') continue;
        rows.unshift({ agreementNo: e.agreementNo, vehicleId: e.vehicleId, tier: e.tier, gate: unitLabel(e.gateId), simTimeSec: e.simTimeSec });
      }
      if (rows.length > max) rows = rows.slice(0, max);
    },
    rows: () => rows,
  };
}
