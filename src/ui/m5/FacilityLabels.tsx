import type { JSX } from 'preact';
import { STATE_LABEL, labelName, type FacilityId, type FacilityStatus } from '../facilities';

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
export function FacilityLabels({ statuses, compact, onSelect }: FacilityLabelsProps): JSX.Element {
  return (
    <div class="facility-labels">
      {statuses.map((s) => (
        <button
          key={s.id}
          type="button"
          class={`facility-label state-${s.state}`}
          data-facility={s.id}
          aria-label={labelName(s)}
          onClick={() => {
            onSelect(s.id);
          }}
        >
          <span class="facility-name">{s.name}</span>
          <span class="facility-state">
            <span class="status-dot" aria-hidden="true" />
            {STATE_LABEL[s.state]}
          </span>
          {compact ? null : <span class="facility-detail">{s.detail}</span>}
        </button>
      ))}
    </div>
  );
}
