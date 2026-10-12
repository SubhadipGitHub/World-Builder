// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presets } from '../../../src/config/scenarios';
import { WhatIfDrawer, type WhatIfDrawerProps } from '../../../src/ui/m4/WhatIfDrawer';
import { idleScenario } from './fixtures';

afterEach(cleanup);

const queues = { returnLane: 4, wash: 7, service: 1, charger: 2, gate: 0 } as const;
const baselineQueues = { returnLane: 1, wash: 2, service: 1, charger: 2, gate: 0 } as const;

function setup(overrides: Partial<WhatIfDrawerProps> = {}) {
  const props: WhatIfDrawerProps = {
    open: true,
    onClose: vi.fn(),
    view: idleScenario(),
    outages: [
      { kind: 'wash', label: 'Wash bays', units: [{ id: 'wash1', label: 'Wash bay 1' }, { id: 'wash2', label: 'Wash bay 2' }] },
      { kind: 'gate', label: 'Exit gates', units: [{ id: 'gate1', label: 'Exit gate 1' }, { id: 'gate2', label: 'Exit gate 2' }] },
    ],
    offlineReason: () => null,
    queues,
    baselineQueues,
    onSurge: vi.fn(),
    onCrew: vi.fn(),
    onSetOnline: vi.fn(),
    onPreset: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  render(<WhatIfDrawer {...props} />);
  return props;
}

describe('WhatIfDrawer (S-6, S-14)', () => {
  it('renders nothing when closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('triggers a surge and shows the countdown while it runs', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Flight bank lands' }));
    expect(props.onSurge).toHaveBeenCalledOnce();
    cleanup();
    setup({ view: idleScenario({ active: true, surgeRemainingSec: 30 * 60 }) });
    expect(screen.getByText('Surge: 30 min left')).toBeTruthy();
  });

  it('sets crew levels per station', () => {
    const props = setup({ view: idleScenario({ active: true, crews: { inspection: 'normal', wash: 'short', service: 'normal' } }) });
    const wash = screen.getByRole('group', { name: 'Wash crew' });
    expect(within(wash).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Short-staffed', 'true'],
      ['Normal', 'false'],
      ['Extra crew', 'false'],
    ]);
    fireEvent.click(within(screen.getByRole('group', { name: 'Service crew' })).getByRole('button', { name: 'Extra crew' }));
    expect(props.onCrew).toHaveBeenLastCalledWith('service', 'extra');
  });

  it('toggles outages and disables the last open unit with its reason', () => {
    const props = setup({
      view: idleScenario({ active: true, offline: ['wash1'] }),
      offlineReason: (id) => (id === 'wash2' ? 'At least one wash bay must stay open' : null),
    });
    const wash1 = screen.getByRole('button', { name: 'Wash bay 1' });
    const wash2 = screen.getByRole('button', { name: 'Wash bay 2' });
    expect(wash1.getAttribute('aria-pressed')).toBe('true');
    expect((wash2 as HTMLButtonElement).disabled).toBe(true);
    expect(wash2.getAttribute('title')).toBe('At least one wash bay must stay open');
    fireEvent.click(wash1);
    expect(props.onSetOnline).toHaveBeenLastCalledWith('wash1', true);
    fireEvent.click(screen.getByRole('button', { name: 'Exit gate 2' }));
    expect(props.onSetOnline).toHaveBeenLastCalledWith('gate2', false);
  });

  it('applies presets and resets to normal', () => {
    const props = setup({ view: idleScenario({ active: true }) });
    for (const p of presets) expect(screen.getByRole('button', { name: p.label })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Wash tunnel down' }));
    expect(props.onPreset).toHaveBeenLastCalledWith('washDown');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to normal' }));
    expect(props.onReset).toHaveBeenCalledOnce();
  });

  it('disables Reset while nothing is active, and closes', () => {
    const props = setup();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Reset to normal' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('compares queues with the baseline', () => {
    setup();
    const table = screen.getByRole('table', { name: 'Queues' });
    const rows = within(table).getAllByRole('row').map((r) => within(r).queryAllByRole('cell').map((c) => c.textContent));
    expect(rows.filter((r) => r.length > 0)).toEqual([
      ['4', '1'],
      ['7', '2'],
      ['1', '1'],
      ['2', '2'],
      ['0', '0'],
    ]);
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Return lanes', 'Wash', 'Service', 'EV chargers', 'Exit gates']);
  });
});
