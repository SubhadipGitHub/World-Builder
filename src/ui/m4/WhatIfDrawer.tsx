import type { JSX } from 'preact';
import { CREW_LEVELS, CREW_STATIONS, presets, type CrewLevel, type CrewStation, type OutageKind, type PresetId } from '../../config/scenarios';
import type { ScenarioView } from '../../sim/scenario';
import { CREW_LABEL, LEVEL_LABEL, type QueueKey } from '../scenario';

export interface OutageGroup {
  readonly kind: OutageKind;
  /** e.g. "Wash bays". */
  readonly label: string;
  readonly units: readonly { readonly id: string; readonly label: string }[];
}

export interface WhatIfDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly view: ScenarioView;
  readonly outages: readonly OutageGroup[];
  /** Null if the unit may be taken offline, else the reason (last-unit rule, S-2). */
  readonly offlineReason: (unitId: string) => string | null;
  /** Live queue lengths: this scenario and the baseline (S-14). */
  readonly queues: Readonly<Record<QueueKey, number>>;
  readonly baselineQueues: Readonly<Record<QueueKey, number>>;
  readonly onSurge: () => void;
  readonly onCrew: (station: CrewStation, level: CrewLevel) => void;
  readonly onSetOnline: (unitId: string, online: boolean) => void;
  readonly onPreset: (id: PresetId) => void;
  readonly onReset: () => void;
}

const QUEUE_ROWS: readonly { readonly key: QueueKey; readonly label: string }[] = [
  { key: 'returnLane', label: 'Return lanes' },
  { key: 'wash', label: 'Wash' },
  { key: 'service', label: 'Service' },
  { key: 'charger', label: 'EV chargers' },
  { key: 'gate', label: 'Exit gates' },
];

/**
 * What-if drawer (S-6, S-14). Renders nothing when closed. When open: role="dialog",
 * aria-label "What-if scenarios", a glass panel with:
 *  - "Close" button
 *  - Surge: button "Flight bank lands"; while a surge runs it shows "Surge: <n> min left"
 *  - Crew: per station a group (aria-label "<Station> crew") with buttons Short-staffed / Normal / Extra crew (aria-pressed)
 *  - Outages: per group a list of toggle buttons (aria-pressed = offline); a unit whose `offlineReason` is set
 *    and that is online is disabled, with the reason as its title
 *  - Presets: one button per preset label
 *  - Queues: a table (aria-label "Queues") with a row header per QueueKey (Return lanes, Wash, Service,
 *    EV chargers, Exit gates) and cells "Now" and "Normal"
 *  - "Reset to normal" button, disabled while the view is not active
 */
export function WhatIfDrawer(props: WhatIfDrawerProps): JSX.Element | null {
  if (!props.open) return null;
  const { view } = props;
  const offline = new Set(view.offline);
  return (
    <div role="dialog" aria-label="What-if scenarios" class="panel glass what-if">
      <header class="panel-header">
        <h2>What-if scenarios</h2>
        <button type="button" class="icon-button" onClick={props.onClose}>
          Close
        </button>
      </header>

      <section class="what-if-section">
        <h3>Presets</h3>
        <div class="preset-list">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                props.onPreset(p.id);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section class="what-if-section">
        <h3>Demand surge</h3>
        <button type="button" onClick={props.onSurge}>
          Flight bank lands
        </button>
        {view.surgeRemainingSec !== null ? <p class="note">{`Surge: ${String(Math.ceil(view.surgeRemainingSec / 60))} min left`}</p> : null}
      </section>

      <section class="what-if-section">
        <h3>Crew levels</h3>
        {CREW_STATIONS.map((station) => (
          <div key={station} class="crew-row">
            <span class="crew-label">{CREW_LABEL[station]}</span>
            <div role="group" aria-label={`${CREW_LABEL[station]} crew`} class="segmented">
              {CREW_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={view.crews[station] === level ? 'true' : 'false'}
                  onClick={() => {
                    props.onCrew(station, level);
                  }}
                >
                  {LEVEL_LABEL[level]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section class="what-if-section">
        <h3>Outages</h3>
        {props.outages.map((g) => (
          <div key={g.kind} class="outage-group">
            <span class="crew-label">{g.label}</span>
            <ul class="outage-list" aria-label={g.label}>
              {g.units.map((u) => {
                const isOff = offline.has(u.id);
                const reason = isOff ? null : props.offlineReason(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      class="chip outage-chip"
                      aria-pressed={isOff ? 'true' : 'false'}
                      disabled={reason !== null}
                      title={reason ?? undefined}
                      onClick={() => {
                        props.onSetOnline(u.id, isOff);
                      }}
                    >
                      {u.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section class="what-if-section">
        <h3>Queues</h3>
        <table aria-label="Queues" class="queue-compare">
          <thead>
            <tr>
              <th scope="col">Station</th>
              <th scope="col">Now</th>
              <th scope="col">Normal</th>
            </tr>
          </thead>
          <tbody>
            {QUEUE_ROWS.map((q) => (
              <tr key={q.key}>
                <th scope="row">{q.label}</th>
                <td>{props.queues[q.key]}</td>
                <td>{props.baselineQueues[q.key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <button type="button" class="reset-button" disabled={!view.active} onClick={props.onReset}>
        Reset to normal
      </button>
    </div>
  );
}
