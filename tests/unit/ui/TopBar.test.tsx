// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hub } from '../../../src/layout/hub';
import type { Alert } from '../../../src/ui/alerts';
import { TopBar, type TopBarProps } from '../../../src/ui/m2/TopBar';
import { agent, snapshot } from './fixtures';

afterEach(cleanup);

const alerts: Alert[] = [
  { id: 'a2', severity: 'critical', message: 'Severe damage on GL-PGW-00002 — tow requested', vehicleId: 'GL-PGW-00002', unitId: null, simTimeSec: 20 },
  { id: 'a1', severity: 'warning', message: 'Wash queue at 7 cars', vehicleId: null, unitId: null, simTimeSec: 10 },
];

function setup(overrides: Partial<TopBarProps> = {}) {
  const props: TopBarProps = {
    snapshot: snapshot([agent({ id: 'GL-PGW-04817' }), agent({ id: 'GL-PGW-04999', plate: '9QQQ111' })]),
    unitIds: ['wash1', 'wash2'],
    areas: hub.areas,
    activeArea: 'overview',
    onArea: vi.fn(),
    weather: 'clear',
    onWeather: vi.fn(),
    dayNight: 'auto',
    onDayNight: vi.fn(),
    theme: 'dark',
    onTheme: vi.fn(),
    alerts,
    unread: 2,
    onOpenAlerts: vi.fn(),
    onAlert: vi.fn(),
    onPick: vi.fn(),
    speed: 1,
    onSpeed: vi.fn(),
    chips: [],
    onOpenWhatIf: vi.fn(),
    labelsOn: true,
    onLabels: vi.fn(),
    ...overrides,
  };
  render(<TopBar {...props} />);
  return props;
}

describe('TopBar (D-2)', () => {
  it('shows the brand, the hub clock and the area switcher', () => {
    setup();
    expect(screen.getByText('GoldLane Hub')).toBeTruthy();
    expect(screen.getByLabelText('Hub time').textContent).toBe('09:30');
    expect(screen.getByRole('navigation', { name: 'Areas' })).toBeTruthy();
  });

  it('searches and picks with the keyboard or the mouse', () => {
    const props = setup();
    const box = screen.getByRole('combobox', { name: 'Search vehicles, plates, agreements or bays' });
    fireEvent.input(box, { target: { value: 'GL-PGW-04' } });
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('GL-PGW-04817'), expect.stringContaining('GL-PGW-04999')]);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(props.onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'GL-PGW-04999' }));
    fireEvent.input(box, { target: { value: 'wash bay 1' } });
    fireEvent.click(screen.getByRole('option', { name: /Wash bay 1/ }));
    expect(props.onPick).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'resource', id: 'wash1' }));
  });

  it('changes the weather (X-1)', () => {
    const props = setup();
    const select = screen.getByRole('combobox', { name: 'Weather' });
    expect((select as HTMLSelectElement).value).toBe('clear');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Clear / sunny', 'Heavy rain / slick', 'Overcast', 'Heatwave / high demand']);
    fireEvent.change(select, { target: { value: 'rain' } });
    expect(props.onWeather).toHaveBeenCalledWith('rain');
  });

  it('opens alerts, marks them read, and selects an alert’s vehicle (D-8)', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Alerts, 2 unread' }));
    expect(props.onOpenAlerts).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Severe damage on GL-PGW-00002/ }));
    expect(props.onAlert).toHaveBeenCalledWith(alerts[0]);
  });

  it('switches time of day (X-2)', () => {
    const props = setup({ dayNight: 'auto' });
    const group = screen.getByRole('group', { name: 'Time of day' });
    expect(within(group).getByRole('button', { name: 'Auto' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: 'Night' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(group).getByRole('button', { name: 'Night' }));
    expect(props.onDayNight).toHaveBeenCalledWith('night');
  });

  it('toggles the theme from the user menu (X-4)', () => {
    const props = setup({ theme: 'dark' });
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const toggle = screen.getByRole('switch', { name: 'Light theme' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(props.onTheme).toHaveBeenCalledWith('light');
  });
});

describe('TopBar what-if additions (S-6, S-7, S-18)', () => {
  it('opens the What-if drawer from its button', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'What-if scenarios' }));
    expect(props.onOpenWhatIf).toHaveBeenCalledOnce();
  });

  it('shows active-scenario chips that open the drawer, and none when normal', () => {
    const props = setup({ chips: ['Surge 42 min', '2 units offline'] });
    const chips = screen.getByRole('list', { name: 'Active scenario' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['Surge 42 min', '2 units offline']);
    fireEvent.click(within(chips).getByRole('button', { name: 'Surge 42 min' }));
    expect(props.onOpenWhatIf).toHaveBeenCalledOnce();
    cleanup();
    setup();
    expect(screen.queryByRole('list', { name: 'Active scenario' })).toBeNull();
  });

  it('has the simulation speed control', () => {
    const props = setup({ speed: 0 });
    const group = screen.getByRole('group', { name: 'Simulation speed' });
    expect(within(group).getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: '40×' }));
    expect(props.onSpeed).toHaveBeenLastCalledWith(2);
  });
});

describe('TopBar building labels switch (I-4)', () => {
  it('toggles building labels from the user menu', () => {
    const props = setup({ labelsOn: true });
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const sw = screen.getByRole('switch', { name: 'Building labels' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(props.onLabels).toHaveBeenLastCalledWith(false);
  });
});
