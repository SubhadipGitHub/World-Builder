// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveTable } from '../../../src/ui/m2/LiveTable';
import type { CheckoutRow, FleetRow, QueueRow } from '../../../src/ui/tables';

afterEach(cleanup);

const fleet: FleetRow[] = [
  { id: 'GL-PGW-00001', model: 'Compact EV crossover', status: 'Washing', energy: 'Battery 64%', location: 'Wash & maintenance' },
  { id: 'GL-PGW-00002', model: 'Mid-size sedan', status: 'Ready for rent', energy: 'Fuel 100%', location: 'Ready lot & exit gate' },
];
const queue: QueueRow[] = [{ unitId: 'wash2', bay: 'Wash bay 2', vehicleId: 'GL-PGW-00001', service: 'Wash', remaining: '3 min' }];
const checkouts: CheckoutRow[] = [
  { agreementNo: 'RA-26-0012345', vehicleId: 'GL-PGW-00009', tier: 'Gold', gate: 'Exit gate 1', model: 'Crew-cab pickup', rate: '$84/day', simTimeSec: 600 },
];

function setup() {
  const onSelect = vi.fn();
  render(<LiveTable fleet={fleet} queue={queue} checkouts={checkouts} onSelect={onSelect} clockAt={(t) => `T${String(t)}`} />);
  return onSelect;
}

const bodyRows = () => within(screen.getByRole('tabpanel')).getAllByRole('row').slice(1);

describe('LiveTable (D-6)', () => {
  it('starts on the active fleet tab with its columns and rows', () => {
    setup();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Active fleet', 'Turnaround & service queue', 'Customer checkout log']);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('tabpanel')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Vehicle',
      'Model',
      'Status',
      'Battery / fuel',
      'Location',
    ]);
    expect(bodyRows()).toHaveLength(2);
  });

  it('selects a vehicle by click or Enter', () => {
    const onSelect = setup();
    fireEvent.click(bodyRows()[1]!);
    expect(onSelect).toHaveBeenLastCalledWith('GL-PGW-00002');
    fireEvent.keyDown(bodyRows()[0]!, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('GL-PGW-00001');
  });

  it('switches to the queue and checkout tabs', () => {
    const onSelect = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Turnaround & service queue' }));
    expect(screen.getByRole('tab', { name: 'Turnaround & service queue' }).getAttribute('aria-selected')).toBe('true');
    expect(bodyRows()[0]?.textContent).toContain('Wash bay 2');
    fireEvent.click(bodyRows()[0]!);
    expect(onSelect).toHaveBeenLastCalledWith('GL-PGW-00001');
    fireEvent.click(screen.getByRole('tab', { name: 'Customer checkout log' }));
    // M9 (FE-9): Class and Rate columns added.
    expect(within(screen.getByRole('tabpanel')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Time',
      'Agreement',
      'Vehicle',
      'Class',
      'Rate',
      'Tier',
      'Gate',
    ]);
    expect(bodyRows()[0]?.textContent).toContain('Crew-cab pickup');
    expect(bodyRows()[0]?.textContent).toContain('$84/day');
    expect(bodyRows()[0]?.textContent).toContain('T600');
    expect(bodyRows()[0]?.textContent).toContain('RA-26-0012345');
  });
});
