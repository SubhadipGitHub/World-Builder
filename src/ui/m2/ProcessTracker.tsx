import type { JSX } from 'preact';
import { TRACKER_STAGES, type TrackerStage } from '../../sim/lifecycle';
import { stageLabel } from '../format';
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
export function ProcessTracker({ vehicleId, steps, stageCounts, clockAt }: ProcessTrackerProps): JSX.Element {
  const selected = vehicleId !== null && steps !== null;
  let current = -1;
  if (selected) {
    current = steps.findIndex((s) => s.at === null);
    if (current < 0) current = steps.length - 1;
  }
  return (
    <section class="panel glass tracker" aria-label="Process tracker">
      <h2>Process tracker · {selected ? vehicleId : 'all vehicles'}</h2>
      <ol>
        {TRACKER_STAGES.map((stage, i) => {
          const at = selected ? (steps[i]?.at ?? null) : null;
          const done = selected && at !== null;
          return (
            <li key={stage} class={done ? 'done' : ''} aria-current={i === current ? 'step' : undefined}>
              <span class="step-dot" aria-hidden="true" />
              <span class="step-label">{stageLabel(stage)}</span>
              <span class="step-value">{selected ? (at !== null ? clockAt(at) : '—') : String(stageCounts?.[stage] ?? 0)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
