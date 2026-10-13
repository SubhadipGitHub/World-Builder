/** Demand readout next to the clock (R-7, K9): "Demand ×1.6 · Morning peak" (one decimal). */
export function demandText(demand: { readonly factor: number; readonly period: string }): string {
  return `Demand ×${demand.factor.toFixed(1)} · ${demand.period}`;
}
