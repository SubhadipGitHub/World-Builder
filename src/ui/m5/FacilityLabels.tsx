import type { JSX } from 'preact';
import { notImplemented } from '../../shared/notImplemented';
import type { FacilityId, FacilityStatus } from '../facilities';

export interface FacilityLabelsProps {
  readonly statuses: readonly FacilityStatus[];
  /** Compact mode when zoomed out (I-4): name and status only. */
  readonly compact: boolean;
  readonly onSelect: (id: FacilityId) => void;
}

/**
 * Floating building labels (I-1, I-4), positioned by the render loop through their
 * `data-facility` attribute. A container with class "facility-labels"; per facility a button
 * (class "facility-label state-<state>", aria-label from `labelName`) holding:
 *  - the name, a status dot (aria-hidden) and the status word (OK / Busy / Offline)
 *  - the detail line, unless compact
 * Clicking calls onSelect(id).
 */
export function FacilityLabels(props: FacilityLabelsProps): JSX.Element {
  return notImplemented(props);
}
