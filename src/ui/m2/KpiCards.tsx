import type { JSX } from 'preact';
import { notImplemented } from '../../shared/notImplemented';
import type { KpiCard } from '../kpis';

export interface KpiCardsProps {
  readonly cards: readonly KpiCard[];
}

/**
 * Three KPI cards (D-3) in a region labelled "Key metrics". Each card: label (h3), value,
 * sub-line and a trend arrow with role="img" and aria-label "Trend up" / "Trend down" / "Trend flat".
 */
export function KpiCards(props: KpiCardsProps): JSX.Element {
  return notImplemented(props);
}
