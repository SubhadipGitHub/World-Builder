import { describe, expect, it } from 'vitest';
import { createKpiTracker } from '../../../src/ui/kpis';
import { metrics } from './fixtures';

const byId = (t: ReturnType<typeof createKpiTracker>) => Object.fromEntries(t.cards().map((c) => [c.id, c]));

describe('createKpiTracker (D-3)', () => {
  // M9 (FE-8): a 4th card, revenue (was three cards).
  it('formats the four cards', () => {
    const t = createKpiTracker(300);
    t.observe(metrics(), 0);
    expect(t.cards().map((c) => c.id)).toEqual(['turnaround', 'utilisation', 'evSoc', 'revenue']);
    const c = byId(t);
    expect(c.turnaround).toMatchObject({ label: 'Turnaround time', value: '54 min', sub: 'Return → Ready lot', trend: 'flat' });
    expect(c.utilisation).toMatchObject({ label: 'Fleet utilisation', value: '65%', sub: 'Ready 18 · In turnaround 24', trend: 'flat' });
    expect(c.evSoc).toMatchObject({ label: 'EV state of charge', value: '86%', sub: 'Ready EVs', trend: 'flat' });
    expect(c.revenue).toMatchObject({ label: 'Revenue today', value: '$18,420', sub: 'At risk $1,240 · 18 waiting > 20 min', trend: 'flat' });
  });

  it('says when no customer is at risk (FE-8)', () => {
    const t = createKpiTracker(300);
    t.observe(metrics({ revenue: { today: 0, total: 0, rentalsToday: 0, atRisk: 0, atRiskCount: 0 } }), 0);
    expect(byId(t).revenue).toMatchObject({ value: '$0', sub: 'No customers at risk' });
  });

  it('shows the revenue trend over a sample period (FE-8)', () => {
    const t = createKpiTracker(300);
    t.observe(metrics(), 0);
    t.observe(metrics({ revenue: { today: 19_000, total: 19_000, rentalsToday: 268, atRisk: 0, atRiskCount: 0 } }), 300);
    expect(byId(t).revenue?.trend).toBe('up');
  });

  it('shows a dash for unknown values', () => {
    const t = createKpiTracker(300);
    t.observe(metrics({ turnaroundMin: null, readyEvSocPct: null }), 0);
    expect(byId(t).turnaround?.value).toBe('—');
    expect(byId(t).evSoc?.value).toBe('—');
  });

  it('compares with a sample at least one period old', () => {
    const t = createKpiTracker(300);
    t.observe(metrics(), 0);
    t.observe(metrics({ turnaroundMin: 60, utilisation: 0.6 }), 150);
    expect(byId(t).turnaround?.trend).toBe('flat');
    t.observe(metrics({ turnaroundMin: 60, utilisation: 0.6 }), 300);
    expect(byId(t).turnaround?.trend).toBe('up');
    expect(byId(t).utilisation?.trend).toBe('down');
    t.observe(metrics({ turnaroundMin: 60, utilisation: 0.6 }), 310);
    expect(byId(t).turnaround?.trend).toBe('up');
  });

  it('ignores changes within half a unit', () => {
    const t = createKpiTracker(300);
    t.observe(metrics(), 0);
    t.observe(metrics({ turnaroundMin: 54.8, utilisation: 0.652, readyEvSocPct: 86.5, revenue: { today: 18_420, total: 18_420, rentalsToday: 260, atRisk: 1_240, atRiskCount: 18 } }), 300);
    for (const card of t.cards()) expect(card.trend).toBe('flat');
  });
});
