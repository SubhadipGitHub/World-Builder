import { notImplemented } from '../shared/notImplemented';
import type { SimEvent } from '../sim/events';
import type { TrackerStage } from '../sim/lifecycle';

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
  return notImplemented();
}
