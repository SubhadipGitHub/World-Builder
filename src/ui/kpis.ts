import { notImplemented } from '../shared/notImplemented';
import type { Trend } from '../sim/metrics';
import type { Metrics } from '../sim/world';

export type KpiId = 'turnaround' | 'utilisation' | 'evSoc';

export interface KpiCard {
  readonly id: KpiId;
  /** "Turnaround time", "Fleet utilisation", "EV state of charge". */
  readonly label: string;
  /** e.g. "54 min", "65%", "86%"; "—" when unknown. */
  readonly value: string;
  /** e.g. "Return → Ready lot", "Ready 18 · In turnaround 24", "Ready EVs". */
  readonly sub: string;
  readonly trend: Trend;
}

/** KPI cards with trend arrows (D-3). Trends compare against the value one sample period earlier. */
export interface KpiTracker {
  observe(metrics: Metrics, simTimeSec: number): void;
  cards(): readonly KpiCard[];
}

/** Default sample period: 5 simulated minutes. */
export function createKpiTracker(samplePeriodSec?: number): KpiTracker {
  return notImplemented(samplePeriodSec);
}
