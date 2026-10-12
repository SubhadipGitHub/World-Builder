import type { Signal } from '@preact/signals';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { WeatherMode } from '../../config/weather';
import { hub, type AreaId } from '../../layout/hub';
import type { DayNight } from '../../render/environment';
import type { TrackerStage } from '../../sim/lifecycle';
import type { Snapshot } from '../../sim/world';
import type { Alert } from '../alerts';
import type { CrewLevel, CrewStation, PresetId } from '../../config/scenarios';
import type { FacilityId, FacilityStatus } from '../facilities';
import type { PlaceId, PlaceLabel } from '../places';
import type { KpiCard, KpiId } from '../kpis';
import { DetailPanel } from '../m1/DetailPanel';
import { WhatIfDrawer, type OutageGroup } from '../m4/WhatIfDrawer';
import { FacilityLabels } from '../m5/FacilityLabels';
import type { Speed } from '../m4/SpeedControl';
import { scenarioChips, type KpiDelta, type QueueKey } from '../scenario';
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
  /** KPI deltas against the baseline while relevant (S-12); empty otherwise. */
  readonly deltas: Partial<Readonly<Record<KpiId, KpiDelta | null>>>;
  /** Queue lengths now and in the baseline (S-14). */
  readonly queues: Readonly<Record<QueueKey, number>>;
  readonly baselineQueues: Readonly<Record<QueueKey, number>>;
  /** Building indicators (I-1). */
  readonly facilities: readonly FacilityStatus[];
  /** Compact labels when zoomed out (I-4). */
  readonly compactLabels: boolean;
  /** Airport name labels (L-1). */
  readonly places: readonly PlaceLabel[];
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
  readonly speed: Speed;
  readonly labels: boolean;
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
  /** Selects a unit (scenario alerts, S-9). */
  readonly onSelectUnit: (id: string) => void;
  readonly scenario: ScenarioActions;
  readonly onLabels: (on: boolean) => void;
  /** Flies the camera to a facility (Q2). */
  readonly onFacility: (id: FacilityId) => void;
  /** Flies the camera to an airport place (L-1). */
  readonly onPlace: (id: PlaceId) => void;
}

/** What-if wiring (§9): levers go to the visible simulation only; speed to both (W7–W9). */
export interface ScenarioActions {
  readonly outages: readonly OutageGroup[];
  readonly offlineReason: (unitId: string) => string | null;
  readonly isOutageable: (unitId: string) => boolean;
  readonly onSurge: () => void;
  readonly onCrew: (station: CrewStation, level: CrewLevel) => void;
  readonly onSetOnline: (unitId: string, online: boolean) => void;
  readonly onPreset: (id: PresetId) => void;
  readonly onReset: () => void;
  readonly onSpeed: (speed: Speed) => void;
}

/**
 * M2 glass dashboard (block 4): top bar, KPI cards, and a sheet holding the detail panel,
 * process tracker and live table. On wide screens the sheet's parts float in the corners;
 * below 720 px they stack in a bottom sheet with a handle (X-3).
 */
export function Dashboard(props: DashboardProps): JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const data = props.data.value;
  const tables = props.tables.value;
  const settings = props.settings.value;
  const selection = props.store.selection.value;
  const vehicleId = selection?.kind === 'agent' && data.steps ? selection.id : null;

  return (
    <div class="dashboard">
      {settings.labels ? <FacilityLabels statuses={data.facilities} compact={data.compactLabels} onSelect={props.onFacility} places={data.places} onPlace={props.onPlace} /> : null}
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
          else if (a.unitId) props.onSelectUnit(a.unitId);
        }}
        onPick={props.onPick}
        speed={settings.speed}
        onSpeed={props.scenario.onSpeed}
        chips={data.snapshot ? scenarioChips(data.snapshot.scenario) : []}
        onOpenWhatIf={() => {
          setWhatIfOpen(true);
        }}
        labelsOn={settings.labels}
        onLabels={props.onLabels}
      />
      <KpiCards cards={data.cards} deltas={data.deltas} />
      {data.snapshot ? (
        <WhatIfDrawer
          open={whatIfOpen}
          onClose={() => {
            setWhatIfOpen(false);
          }}
          view={data.snapshot.scenario}
          outages={props.scenario.outages}
          offlineReason={props.scenario.offlineReason}
          queues={data.queues}
          baselineQueues={data.baselineQueues}
          onSurge={props.scenario.onSurge}
          onCrew={props.scenario.onCrew}
          onSetOnline={props.scenario.onSetOnline}
          onPreset={props.scenario.onPreset}
          onReset={props.scenario.onReset}
        />
      ) : null}
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
            unitControl={{
              offlineReason: props.scenario.offlineReason,
              isOutageable: props.scenario.isOutageable,
              onSetOnline: props.scenario.onSetOnline,
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
