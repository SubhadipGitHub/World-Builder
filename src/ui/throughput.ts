import type { ResourceView } from '../sim/world';

/**
 * Derives per-unit throughput from successive resource snapshots (I-4): a completion is
 * an occupant leaving a unit. Used for "throughput per hour" and a gate's "last exit".
 */
export interface ThroughputTracker {
  observe(resources: readonly ResourceView[], simTimeSec: number): void;
  /** Completions in the trailing simulated hour. */
  perHour(unitId: string): number;
  /** Sim time of the latest completion, or null. */
  lastCompletion(unitId: string): number | null;
  /** Vehicle id of the latest completion, or null. */
  lastOccupant(unitId: string): string | null;
}

const HOUR = 3600;

interface UnitHistory {
  occupant: string | null;
  times: number[];
  last: { at: number; id: string } | null;
}

export function createThroughputTracker(): ThroughputTracker {
  const units = new Map<string, UnitHistory>();
  let now = 0;
  return {
    observe(resources, simTimeSec) {
      now = simTimeSec;
      for (const r of resources) {
        const h = units.get(r.id);
        if (!h) {
          units.set(r.id, { occupant: r.occupantId, times: [], last: null });
          continue;
        }
        if (h.occupant !== null && h.occupant !== r.occupantId) {
          h.times.push(simTimeSec);
          h.last = { at: simTimeSec, id: h.occupant };
        }
        h.occupant = r.occupantId;
        while (h.times.length > 0 && (h.times[0] as number) <= now - HOUR) h.times.shift();
      }
    },
    perHour(unitId) {
      return units.get(unitId)?.times.filter((t) => t > now - HOUR).length ?? 0;
    },
    lastCompletion: (unitId) => units.get(unitId)?.last?.at ?? null,
    lastOccupant: (unitId) => units.get(unitId)?.last?.id ?? null,
  };
}
