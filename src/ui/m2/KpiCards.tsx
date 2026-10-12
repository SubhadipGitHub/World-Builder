import type { JSX } from 'preact';
import type { KpiCard } from '../kpis';

export interface KpiCardsProps {
  readonly cards: readonly KpiCard[];
}

const ARROWS = { up: '▲', down: '▼', flat: '▬' } as const;

/**
 * Three KPI cards (D-3) in a region labelled "Key metrics". Each card: label (h3), value,
 * sub-line and a trend arrow with role="img" and aria-label "Trend up" / "Trend down" / "Trend flat".
 */
export function KpiCards({ cards }: KpiCardsProps): JSX.Element {
  return (
    <section class="kpis" aria-label="Key metrics">
      {cards.map((c) => (
        <article key={c.id} class="panel glass kpi">
          <h3>{c.label}</h3>
          <p class="kpi-value">
            <span class="kpi-number">{c.value}</span>
            <span role="img" aria-label={`Trend ${c.trend}`} class={`trend trend-${c.trend}`}>
              {ARROWS[c.trend]}
            </span>
          </p>
          <p class="kpi-sub">{c.sub}</p>
        </article>
      ))}
    </section>
  );
}
