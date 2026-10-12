// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hub } from '../../../src/layout/hub';
import { AreaSwitcher } from '../../../src/ui/m1/AreaSwitcher';

afterEach(cleanup);

describe('AreaSwitcher (I-5)', () => {
  it('renders one button per area inside a labelled nav', () => {
    render(<AreaSwitcher areas={hub.areas} active="overview" onSelect={() => undefined} />);
    const nav = screen.getByRole('navigation', { name: 'Areas' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(hub.areas.map((a) => a.label));
  });

  it('marks only the active area as pressed', () => {
    render(<AreaSwitcher areas={hub.areas} active="energy" onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: 'EV charging & fuel' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Overview' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the chosen area', () => {
    const onSelect = vi.fn();
    render(<AreaSwitcher areas={hub.areas} active="overview" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ready lot & exit gate' }));
    expect(onSelect).toHaveBeenCalledWith('lot');
  });
});

describe('AreaSwitcher: Airport area (L-2)', () => {
  it('lists the Airport area last, centred on the terminal and apron', () => {
    const last = hub.areas[hub.areas.length - 1]!;
    expect(last).toMatchObject({ id: 'airport', label: 'Airport' });
    expect(last.z).toBeGreaterThan(300);
    expect(last.distance).toBeGreaterThanOrEqual(600);
    render(<AreaSwitcher areas={hub.areas} active="overview" onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Airport' })).toBeTruthy();
  });
});
