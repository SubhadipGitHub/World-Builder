import type { Signal } from '@preact/signals';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { WeatherMode } from '../../config/weather';
import { hub, type AreaId } from '../../layout/hub';
import type { DayNight } from '../../render/environment';
import type { TrackerStage } from '../../sim/lifecycle';
import type { Snapshot } from '../../sim/world';
import type { Alert } from '../alerts';
import type { KpiCard } from '../kpis';
import { DetailPanel } from '../m1/DetailPanel';
import type { SearchResult } from '../search';
import type { UiStore } from '../store';
import type { CheckoutRow, FleetRow, QueueRow } from '../tables';
import type { Theme } from '../theme';
import type { ThroughputTracker } from '../throughput';
import type { TimelineStep } from '../timeline';
import { KpiCards } from './KpiCards';
import { LiveTable } from './LiveTable';
import { ProcessTracker } from './ProcessTracker';
import { TopBar } from './TopBar';

/** Everything the panels show, refreshed by the render loop (architecture §15.1). */
export interface DashboardData {
  readonly snapshot: Snapshot | null;
  readonly cards: readonly KpiCard[];
  readonly alerts: readonly Alert[];
  readonly unread: number;
  readonly steps: readonly TimelineStep[] | null;
  readonly stageCounts: Readonly<Record<TrackerStage, number>> | null;
}

export interface TableData {
  readonly fleet: readonly FleetRow[];
  readonly queue: readonly QueueRow[];
  readonly checkouts: readonly CheckoutRow[];
}

export interface Settings {
  readonly weather: WeatherMode;
  readonly dayNight: DayNight;
  readonly theme: Theme;
}

export interface DashboardProps {
  readonly store: UiStore;
  readonly data: Signal<DashboardData>;
  readonly tables: Signal<TableData>;
  readonly settings: Signal<Settings>;
  readonly unitIds: readonly string[];
  readonly throughput: ThroughputTracker;
  readonly clockAt: (simTimeSec: number) => string;
  readonly onArea: (id: AreaId) => void;
  readonly onWeather: (mode: WeatherMode) => void;
  readonly onDayNight: (value: DayNight) => void;
  readonly onTheme: (theme: Theme) => void;
  readonly onOpenAlerts: () => void;
  readonly onPick: (result: SearchResult) => void;
  readonly onSelectVehicle: (id: string) => void;
}

/**
 * M2 glass dashboard (block 4): top bar, KPI cards, and a sheet holding the detail panel,
 * process tracker and live table. On wide screens the sheet's parts float in the corners;
 * below 720 px they stack in a bottom sheet with a handle (X-3).
 */
export function Dashboard(props: DashboardProps): JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);
  const data = props.data.value;
  const tables = props.tables.value;
  const settings = props.settings.value;
  const selection = props.store.selection.value;
  const vehicleId = selection?.kind === 'agent' && data.steps ? selection.id : null;

  return (
    <div class="dashboard">
      <TopBar
        snapshot={data.snapshot}
        unitIds={props.unitIds}
        areas={hub.areas}
        activeArea={props.store.area.value}
        onArea={props.onArea}
        weather={settings.weather}
        onWeather={props.onWeather}
        dayNight={settings.dayNight}
        onDayNight={props.onDayNight}
        theme={settings.theme}
        onTheme={props.onTheme}
        alerts={data.alerts}
        unread={data.unread}
        onOpenAlerts={props.onOpenAlerts}
        onAlert={(a) => {
          if (a.vehicleId) props.onSelectVehicle(a.vehicleId);
        }}
        onPick={props.onPick}
      />
      <KpiCards cards={data.cards} />
      <div class="sheet" data-testid="bottom-sheet" data-open={sheetOpen ? 'true' : 'false'}>
        <button
          type="button"
          class="sheet-handle"
          aria-label={sheetOpen ? 'Collapse panels' : 'Expand panels'}
          aria-expanded={sheetOpen ? 'true' : 'false'}
          onClick={() => {
            setSheetOpen(!sheetOpen);
          }}
        >
          <span aria-hidden="true" />
        </button>
        <div class="sheet-detail">
          <DetailPanel
            selection={selection}
            snapshot={data.snapshot}
            throughput={props.throughput}
            onClose={() => {
              props.store.clearSelection();
            }}
          />
        </div>
        <div class="sheet-tracker">
          <ProcessTracker vehicleId={vehicleId} steps={vehicleId ? data.steps : null} stageCounts={data.stageCounts} clockAt={props.clockAt} />
        </div>
        <div class="sheet-table">
          <LiveTable fleet={tables.fleet} queue={tables.queue} checkouts={tables.checkouts} onSelect={props.onSelectVehicle} clockAt={props.clockAt} />
        </div>
      </div>
    </div>
  );
}
