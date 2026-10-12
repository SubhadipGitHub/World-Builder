import { Fragment, type JSX } from 'preact';
import type { AgentView, ResourceView, Snapshot } from '../../sim/world';
import { classLabel, formatDuration, formatMiles, formatPercent, formatSpeed, kindLabel, stageLabel, stateLabel, unitLabel } from '../format';
import type { Selection } from '../store';
import type { ThroughputTracker } from '../throughput';

export interface DetailPanelProps {
  readonly selection: Selection;
  readonly snapshot: Snapshot | null;
  readonly throughput: ThroughputTracker;
  readonly onClose: () => void;
}

type Row = readonly [label: string, value: string];

interface Content {
  readonly title: string;
  readonly rows: readonly Row[];
  readonly note?: string;
}

function agentContent(a: AgentView): Content {
  if (a.kind !== 'fleet' || a.cls === null) {
    return { title: kindLabel(a.kind), rows: [['Task', a.task], ['Speed', formatSpeed(a.speed)]] };
  }
  const energy: Row = a.cls === 'ev' ? ['Battery', formatPercent(a.socPct)] : ['Fuel', formatPercent(a.fuelPct)];
  return {
    title: a.id,
    rows: [
      ['Model', classLabel(a.cls)],
      ['Plate', a.plate ?? '—'],
      ['Status', a.state ? stateLabel(a.state) : '—'],
      ['Stage', a.stage ? stageLabel(a.stage) : '—'],
      energy,
      ['Odometer', formatMiles(a.odometerMi)],
      ['Task', a.task],
      ['ETA', formatDuration(a.etaSimSec)],
    ],
  };
}

function resourceContent(id: string, r: ResourceView | undefined, throughput: ThroughputTracker, now: number): Content {
  const occupant = r ? (r.occupantId ?? 'Idle') : '—';
  if (r?.kind === 'gate') {
    const last = throughput.lastOccupant(id);
    const at = throughput.lastCompletion(id);
    return {
      title: unitLabel(id),
      rows: [
        ['Occupant', occupant],
        ['Last exit', last !== null && at !== null ? `${last} · ${formatDuration(now - at)} ago` : '—'],
        ['Exits per hour', String(throughput.perHour(id))],
      ],
    };
  }
  return {
    title: unitLabel(id),
    rows: [
      ['Occupant', occupant],
      ['Progress', r?.progress != null ? formatPercent(r.progress * 100) : '—'],
      ['Queue', r ? String(r.queueLength) : '—'],
      ['Throughput', `${String(throughput.perHour(id))} / h`],
    ],
  };
}

/**
 * Minimal M1 detail panel (I-4); restyled as glass in M2 (D-4).
 * Renders nothing without a selection. Landmark: role="region", aria-label="Details".
 *  - Fleet vehicle: ID heading; Model, Plate, Status, Stage, Battery or Fuel, Odometer, Task, ETA.
 *  - Other agents: kind label heading; Task, Speed.
 *  - Bay / charger / kiosk / slot: unit label heading; Occupant ("Idle"), Progress, Queue, Throughput ("n / h").
 *  - Gate: unit label heading; Occupant, Last exit, Exits per hour.
 *  - A selected agent missing from the snapshot shows "Left the hub".
 *  - Close button labelled "Close details".
 */
export function DetailPanel({ selection, snapshot, throughput, onClose }: DetailPanelProps): JSX.Element | null {
  if (selection === null) return null;
  let content: Content;
  if (selection.kind === 'agent') {
    const agent = snapshot?.agents.find((a) => a.id === selection.id);
    content = agent ? agentContent(agent) : { title: selection.id, rows: [], note: 'Left the hub' };
  } else {
    const r = snapshot?.resources.find((x) => x.id === selection.id);
    content = resourceContent(selection.id, r, throughput, snapshot?.simTimeSec ?? 0);
  }
  return (
    <section class="panel detail-panel" role="region" aria-label="Details">
      <header class="panel-header">
        <h2>{content.title}</h2>
        <button type="button" class="icon-button" aria-label="Close details" onClick={onClose}>
          ×
        </button>
      </header>
      {content.note ? <p class="note">{content.note}</p> : null}
      <dl class="stats">
        {content.rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
