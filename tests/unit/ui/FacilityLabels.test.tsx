// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FacilityStatus } from '../../../src/ui/facilities';
import { FacilityLabels } from '../../../src/ui/m5/FacilityLabels';

afterEach(cleanup);

const statuses: FacilityStatus[] = [
  { id: 'wash', name: 'Express Wash', state: 'busy', busy: 2, total: 2, queue: 4, offline: 0, detail: '2/2 busy · queue 4' },
  { id: 'gates', name: 'Exit Gates', state: 'offline', busy: 1, total: 2, queue: 1, offline: 1, detail: '1 offline · 1/1 busy · queue 1' },
  { id: 'fuel', name: 'Fuel', state: 'ok', busy: 0, total: 4, queue: 0, offline: 0, detail: '0/4 busy · queue 0' },
];

describe('FacilityLabels (I-1, I-4)', () => {
  it('renders a button per facility with name, status word, detail and an accessible name', () => {
    render(<FacilityLabels statuses={statuses} compact={false} onSelect={vi.fn()} />);
    const wash = screen.getByRole('button', { name: 'Express Wash, Busy, 2 of 2 busy, queue 4' });
    expect(wash.textContent).toContain('Express Wash');
    expect(wash.textContent).toContain('Busy');
    expect(wash.textContent).toContain('2/2 busy · queue 4');
    expect(wash.classList.contains('state-busy')).toBe(true);
    expect(wash.getAttribute('data-facility')).toBe('wash');
    expect(screen.getByRole('button', { name: /^Exit Gates, Offline/ }).classList.contains('state-offline')).toBe(true);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('drops the detail line when compact', () => {
    render(<FacilityLabels statuses={statuses} compact onSelect={vi.fn()} />);
    const fuel = screen.getByRole('button', { name: /^Fuel, OK/ });
    expect(fuel.textContent).toContain('OK');
    expect(fuel.textContent).not.toContain('0/4 busy');
  });

  it('reports the clicked facility', () => {
    const onSelect = vi.fn();
    render(<FacilityLabels statuses={statuses} compact={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /^Exit Gates/ }));
    expect(onSelect).toHaveBeenCalledWith('gates');
  });
});
