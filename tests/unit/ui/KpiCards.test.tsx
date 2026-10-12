// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { KpiCard } from '../../../src/ui/kpis';
import { KpiCards } from '../../../src/ui/m2/KpiCards';

afterEach(cleanup);

const cards: KpiCard[] = [
  { id: 'turnaround', label: 'Turnaround time', value: '54 min', sub: 'Return → Ready lot', trend: 'up' },
  { id: 'utilisation', label: 'Fleet utilisation', value: '65%', sub: 'Ready 18 · In turnaround 24', trend: 'down' },
  { id: 'evSoc', label: 'EV state of charge', value: '86%', sub: 'Ready EVs', trend: 'flat' },
];

describe('KpiCards (D-3)', () => {
  it('renders three cards with values, sub-lines and labelled trend arrows', () => {
    render(<KpiCards cards={cards} />);
    const region = screen.getByRole('region', { name: 'Key metrics' });
    expect(within(region).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Turnaround time', 'Fleet utilisation', 'EV state of charge']);
    expect(within(region).getByText('54 min')).toBeTruthy();
    expect(within(region).getByText('Ready 18 · In turnaround 24')).toBeTruthy();
    expect(within(region).getAllByRole('img').map((i) => i.getAttribute('aria-label'))).toEqual(['Trend up', 'Trend down', 'Trend flat']);
  });
});
