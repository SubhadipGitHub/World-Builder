import type { SimEvent } from '../sim/events';
import { TRACKER_STAGES, type TrackerStage } from '../sim/lifecycle';

export interface TimelineStep {
  readonly stage: TrackerStage;
  /** Sim time the milestone was reached in the current cycle, or null if not yet. */
  readonly at: number | null;
}

/** Per-vehicle milestone timestamps for the process tracker (D-5). */
export interface Timeline {
  ingest(events: readonly SimEvent[]): void;
  /** All 6 steps in order. A 'returned' milestone starts a new cycle and clears the later steps. */
  stepsFor(vehicleId: string): readonly TimelineStep[];
}

export function createTimeline(): Timeline {
  const cycles = new Map<string, Map<TrackerStage, number>>();
  return {
    ingest(events) {
      for (const e of events) {
        if (e.type !== 'milestone') continue;
        let cycle = cycles.get(e.vehicleId);
        if (!cycle || e.stage === 'returned') {
          cycle = new Map();
          cycles.set(e.vehicleId, cycle);
        }
        cycle.set(e.stage, e.simTimeSec);
      }
    },
    stepsFor(vehicleId) {
      const cycle = cycles.get(vehicleId);
      return TRACKER_STAGES.map((stage) => ({ stage, at: cycle?.get(stage) ?? null }));
    },
  };
}
