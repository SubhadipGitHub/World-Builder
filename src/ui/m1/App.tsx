import type { Signal } from '@preact/signals';
import type { JSX } from 'preact';
import { brand } from '../../config/brand';
import { hub, type AreaId } from '../../layout/hub';
import type { Snapshot } from '../../sim/world';
import { formatClock } from '../format';
import type { UiStore } from '../store';
import type { ThroughputTracker } from '../throughput';
import { AreaSwitcher } from './AreaSwitcher';
import { DetailPanel } from './DetailPanel';

export interface AppProps {
  readonly store: UiStore;
  /** Refreshed at about 10 Hz by the render loop (architecture §5). */
  readonly snapshot: Signal<Snapshot | null>;
  readonly throughput: ThroughputTracker;
  readonly onArea: (id: AreaId) => void;
}

/** M1 overlay: brand chip with clock, area switcher and detail panel. M2 restyles this as glass. */
export function App({ store, snapshot, throughput, onArea }: AppProps): JSX.Element {
  const snap = snapshot.value;
  return (
    <div class="overlay-layout">
      <div class="top-left">
        <header class="panel brand-chip">
          <span class="brand-mark" aria-hidden="true" />
          <div>
            <h1>{brand.appName}</h1>
            <p>
              {brand.hubName}
              {snap ? <span class="clock"> · {formatClock(snap.clockHours)}</span> : null}
            </p>
          </div>
        </header>
        <AreaSwitcher areas={hub.areas} active={store.area.value} onSelect={onArea} />
      </div>
      <div class="right">
        <DetailPanel
          selection={store.selection.value}
          snapshot={snap}
          throughput={throughput}
          onClose={() => {
            store.clearSelection();
          }}
        />
      </div>
    </div>
  );
}
