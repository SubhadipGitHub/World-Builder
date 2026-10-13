import { trend, type Trend } from '../sim/metrics';
import type { Metrics } from '../sim/world';
import { formatMoney } from './format';

export type KpiId = 'turnaround' | 'utilisation' | 'evSoc' | 'revenue';

export interface KpiCard {
  readonly id: KpiId;
  /** "Turnaround time", "Fleet utilisation", "EV state of charge", "Revenue today". */
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

/** Changes smaller than this (minutes or percentage points) show as flat. */
const EPSILON = 0.5;

interface Values {
  readonly turnaround: number | null;
  readonly utilisation: number;
  readonly evSoc: number | null;
  readonly revenue: number;
}

const valuesOf = (m: Metrics): Values => ({ turnaround: m.turnaroundMin, utilisation: m.utilisation * 100, evSoc: m.readyEvSocPct, revenue: m.revenue.today });

/** Revenue changes under a dollar show as flat. */
const REVENUE_EPSILON = 1;

/** "At risk $1,240 · 18 waiting > 20 min", or "No customers at risk" (FE-8). */
const atRiskText = (m: Metrics): string =>
  m.revenue.atRiskCount === 0 ? 'No customers at risk' : `At risk ${formatMoney(m.revenue.atRisk)} · ${String(m.revenue.atRiskCount)} waiting > 20 min`;

/** Default sample period: 5 simulated minutes. */
export function createKpiTracker(samplePeriodSec = 300): KpiTracker {
  const samples: { t: number; v: Values }[] = [];
  let current: { metrics: Metrics; v: Values; now: number } | null = null;

  const reference = (now: number): Values | null => {
    for (let i = samples.length - 1; i >= 0; i--) {
      const s = samples[i] as { t: number; v: Values };
      if (s.t <= now - samplePeriodSec) return s.v;
    }
    return null;
  };

  return {
    observe(metrics, simTimeSec) {
      const v = valuesOf(metrics);
      current = { metrics, v, now: simTimeSec };
      const last = samples[samples.length - 1];
      if (!last || simTimeSec - last.t >= samplePeriodSec) samples.push({ t: simTimeSec, v });
      while (samples.length > 3 && (samples[1] as { t: number }).t <= simTimeSec - samplePeriodSec) samples.shift();
    },
    cards() {
      if (!current) return [];
      const { metrics, v, now } = current;
      const ref = reference(now);
      const pct = (x: number | null): string => (x === null ? '—' : `${String(Math.round(x))}%`);
      return [
        {
          id: 'turnaround',
          label: 'Turnaround time',
          value: v.turnaround === null ? '—' : `${String(Math.round(v.turnaround))} min`,
          sub: 'Return → Ready lot',
          trend: trend(ref?.turnaround ?? null, v.turnaround, EPSILON),
        },
        {
          id: 'utilisation',
          label: 'Fleet utilisation',
          value: pct(v.utilisation),
          sub: `Ready ${String(metrics.counts.ready)} · In turnaround ${String(metrics.counts.inTurnaround)}`,
          trend: trend(ref?.utilisation ?? null, v.utilisation, EPSILON),
        },
        { id: 'evSoc', label: 'EV state of charge', value: pct(v.evSoc), sub: 'Ready EVs', trend: trend(ref?.evSoc ?? null, v.evSoc, EPSILON) },
        { id: 'revenue', label: 'Revenue today', value: formatMoney(v.revenue), sub: atRiskText(metrics), trend: trend(ref?.revenue ?? null, v.revenue, REVENUE_EPSILON) },
      ];
    },
  };
}
