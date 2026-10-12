import type { JSX } from 'preact';
import { notImplemented } from '../../shared/notImplemented';
import type { TrackerStage } from '../../sim/lifecycle';
import type { TimelineStep } from '../timeline';

export interface ProcessTrackerProps {
  /** Selected fleet vehicle, or null for the all-vehicles view. */
  readonly vehicleId: string | null;
  /** The vehicle's 6 steps (when one is selected). */
  readonly steps: readonly TimelineStep[] | null;
  /** Vehicles at each stage (when none is selected). */
  readonly stageCounts: Readonly<Record<TrackerStage, number>> | null;
  /** Formats a sim time as hub clock time, e.g. "08:12". */
  readonly clockAt: (simTimeSec: number) => string;
}

/**
 * Process tracker (D-5) in a region labelled "Process tracker": an ordered list of the 6 stages
 * with their requirement labels.
 *  - Vehicle selected: heading "Process tracker · <id>"; done steps show their time; the first
 *    step not yet reached has aria-current="step" (the last step once all are done).
 *  - None selected: heading "Process tracker · all vehicles"; each step shows its vehicle count.
 */
export function ProcessTracker(props: ProcessTrackerProps): JSX.Element {
  return notImplemented(props);
}
