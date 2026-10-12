// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ProcessTracker } from '../../../src/ui/m2/ProcessTracker';
import type { TimelineStep } from '../../../src/ui/timeline';

afterEach(cleanup);

const clockAt = (t: number): string => `T${String(t)}`;
const steps: TimelineStep[] = [
  { stage: 'returned', at: 100 },
  { stage: 'inspected', at: 200 },
  { stage: 'washed', at: null },
  { stage: 'energised', at: null },
  { stage: 'staged', at: null },
  { stage: 'dispatched', at: null },
];

describe('ProcessTracker (D-5)', () => {
  it('shows a selected vehicle’s steps with times and marks the current step', () => {
    render(<ProcessTracker vehicleId="GL-PGW-04817" steps={steps} stageCounts={null} clockAt={clockAt} />);
    const region = screen.getByRole('region', { name: 'Process tracker' });
    expect(within(region).getByRole('heading').textContent).toBe('Process tracker · GL-PGW-04817');
    const items = within(region).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Returned'),
      expect.stringContaining('Inspected'),
      expect.stringContaining('Washed & detailed'),
      expect.stringContaining('Refuelled / charged'),
      expect.stringContaining('Staged'),
      expect.stringContaining('Dispatched'),
    ]);
    expect(items[0]?.textContent).toContain('T100');
    expect(items[1]?.textContent).toContain('T200');
    expect(items[2]?.getAttribute('aria-current')).toBe('step');
    expect(items.filter((li) => li.getAttribute('aria-current') === 'step')).toHaveLength(1);
  });

  it('marks the last step once every step is done', () => {
    const done = steps.map((s, i) => ({ ...s, at: (i + 1) * 100 }));
    render(<ProcessTracker vehicleId="v" steps={done} stageCounts={null} clockAt={clockAt} />);
    expect(screen.getAllByRole('listitem')[5]?.getAttribute('aria-current')).toBe('step');
  });

  it('shows how many vehicles are at each step with nothing selected', () => {
    render(
      <ProcessTracker
        vehicleId={null}
        steps={null}
        stageCounts={{ returned: 3, inspected: 5, washed: 4, energised: 6, staged: 18, dispatched: 0 }}
        clockAt={clockAt}
      />,
    );
    expect(screen.getByRole('heading').textContent).toBe('Process tracker · all vehicles');
    const items = screen.getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('3');
    expect(items[4]?.textContent).toContain('18');
  });
});
