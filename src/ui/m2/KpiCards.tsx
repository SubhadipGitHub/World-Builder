import type { JSX } from 'preact';
import type { KpiCard, KpiId } from '../kpis';
import type { KpiDelta } from '../scenario';

export interface KpiCardsProps {
  readonly cards: readonly KpiCard[];
  /** Deltas against the baseline (S-12), shown under the value as "<text>" with class tone-<tone>; omitted when null or absent. */
  readonly deltas?: Partial<Readonly<Record<KpiId, KpiDelta | null>>>;
}

const ARROWS = { up: '▲', down: '▼', flat: '▬' } as const;

/**
 * Three KPI cards (D-3) in a region labelled "Key metrics". Each card: label (h3), value,
 * sub-line and a trend arrow with role="img" and aria-label "Trend up" / "Trend down" / "Trend flat".
 * While a scenario is relevant, a delta line against the baseline follows (S-12).
 */
export function KpiCards({ cards, deltas }: KpiCardsProps): JSX.Element {
  return (
    <section class="kpis" aria-label="Key metrics">
      {cards.map((c) => {
        const delta = deltas?.[c.id] ?? null;
        return (
          <article key={c.id} class="panel glass kpi">
            <h3>{c.label}</h3>
            <p class="kpi-value">
              <span class="kpi-number">{c.value}</span>
              <span role="img" aria-label={`Trend ${c.trend}`} class={`trend trend-${c.trend}`}>
                {ARROWS[c.trend]}
              </span>
            </p>
            <p class="kpi-sub">{c.sub}</p>
            {delta ? <p class={`kpi-delta tone-${delta.tone}`}>{delta.text}</p> : null}
          </article>
        );
      })}
    </section>
  );
}
