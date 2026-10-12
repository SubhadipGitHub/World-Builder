// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentView, ResourceView, Snapshot } from '../../../src/sim/world';
import { idleScenario } from './fixtures';
import { DetailPanel } from '../../../src/ui/m1/DetailPanel';
import type { ThroughputTracker } from '../../../src/ui/throughput';

afterEach(cleanup);

const base: AgentView = {
  id: 'GL-PGW-04817',
  kind: 'fleet',
  cls: 'ev',
  x: 0,
  z: 0,
  heading: 0,
  speed: 0,
  length: 4.75,
  width: 1.92,
  parked: true,
  state: 'energising',
  stage: 'washed',
  plate: '8ABC123',
  agreementNo: null,
  fuelPct: null,
  socPct: 64.2,
  odometerMi: 12_345,
  task: 'Charging at charger3',
  etaSimSec: 725,
  parentId: null,
};

const snapshot = (agents: AgentView[], resources: ResourceView[] = []): Snapshot => ({
  tick: 1,
  simTimeSec: 3_600,
  clockHours: 9,
  weather: 'clear',
  timeScale: 20,
  agents,
  resources,
  scenario: idleScenario(),
  counterQueue: 0,
});

const tracker = (perHour = 0, lastOccupant: string | null = null, lastCompletion: number | null = null): ThroughputTracker => ({
  observe: () => undefined,
  perHour: () => perHour,
  lastCompletion: () => lastCompletion,
  lastOccupant: () => lastOccupant,
});

const row = (label: string): HTMLElement => {
  const region = screen.getByRole('region', { name: 'Details' });
  const term = within(region).getByText(label, { selector: 'dt' });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`No value for ${label}`);
  return value;
};

describe('DetailPanel (I-4)', () => {
  it('renders nothing without a selection', () => {
    const { container } = render(<DetailPanel selection={null} snapshot={snapshot([base])} throughput={tracker()} onClose={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a fleet EV’s live stats', () => {
    render(<DetailPanel selection={{ kind: 'agent', id: base.id }} snapshot={snapshot([base])} throughput={tracker()} onClose={() => undefined} />);
    expect(screen.getByRole('heading', { name: base.id })).toBeTruthy();
    expect(row('Model').textContent).toBe('Compact EV crossover');
    expect(row('Plate').textContent).toBe('8ABC123');
    expect(row('Status').textContent).toBe('Charging / refuelling');
    expect(row('Stage').textContent).toBe('Washed & detailed');
    expect(row('Battery').textContent).toBe('64%');
    expect(row('Odometer').textContent).toBe('12,345 mi');
    expect(row('Task').textContent).toBe('Charging at charger3');
    expect(row('ETA').textContent).toBe('12 min');
  });

  it('shows fuel instead of battery for a petrol car', () => {
    const car = { ...base, cls: 'sedan' as const, socPct: null, fuelPct: 37 };
    render(<DetailPanel selection={{ kind: 'agent', id: car.id }} snapshot={snapshot([car])} throughput={tracker()} onClose={() => undefined} />);
    expect(row('Fuel').textContent).toBe('37%');
    expect(screen.queryByText('Battery', { selector: 'dt' })).toBeNull();
  });

  it('says when the selected vehicle has left the hub', () => {
    render(<DetailPanel selection={{ kind: 'agent', id: 'GL-PGW-99999' }} snapshot={snapshot([base])} throughput={tracker()} onClose={() => undefined} />);
    expect(screen.getByText('Left the hub')).toBeTruthy();
  });

  it('shows other agents by kind', () => {
    const shuttle: AgentView = { ...base, id: 'shuttle-1', kind: 'shuttle', cls: null, state: null, stage: null, plate: null, socPct: null, odometerMi: null, task: 'Airport loop', speed: 8.3, etaSimSec: null };
    render(<DetailPanel selection={{ kind: 'agent', id: 'shuttle-1' }} snapshot={snapshot([shuttle])} throughput={tracker()} onClose={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Shuttle bus' })).toBeTruthy();
    expect(row('Task').textContent).toBe('Airport loop');
    expect(row('Speed').textContent).toBe('19 mph');
  });

  it('shows a busy bay with progress, queue and throughput', () => {
    const res: ResourceView = { id: 'wash2', kind: 'wash', occupantId: base.id, queueLength: 3, progress: 0.5, online: true };
    render(<DetailPanel selection={{ kind: 'resource', id: 'wash2' }} snapshot={snapshot([base], [res])} throughput={tracker(14)} onClose={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Wash bay 2' })).toBeTruthy();
    expect(row('Occupant').textContent).toBe(base.id);
    expect(row('Progress').textContent).toBe('50%');
    expect(row('Queue').textContent).toBe('3');
    expect(row('Throughput').textContent).toBe('14 / h');
  });

  it('shows an idle unit', () => {
    const res: ResourceView = { id: 'charger1', kind: 'charger', occupantId: null, queueLength: 0, progress: null, online: true };
    render(<DetailPanel selection={{ kind: 'resource', id: 'charger1' }} snapshot={snapshot([], [res])} throughput={tracker()} onClose={() => undefined} />);
    expect(row('Occupant').textContent).toBe('Idle');
    expect(row('Progress').textContent).toBe('—');
  });

  it('shows a gate’s last exit and exits per hour', () => {
    const res: ResourceView = { id: 'gate1', kind: 'gate', occupantId: null, queueLength: 1, progress: null, online: true };
    render(
      <DetailPanel selection={{ kind: 'resource', id: 'gate1' }} snapshot={snapshot([], [res])} throughput={tracker(9, 'GL-PGW-11111', 3_300)} onClose={() => undefined} />,
    );
    expect(screen.getByRole('heading', { name: 'Exit gate 1' })).toBeTruthy();
    expect(row('Last exit').textContent).toBe('GL-PGW-11111 · 5 min ago');
    expect(row('Exits per hour').textContent).toBe('9');
  });

  it('calls onClose from the close button', () => {
    const onClose = vi.fn();
    render(<DetailPanel selection={{ kind: 'agent', id: base.id }} snapshot={snapshot([base])} throughput={tracker()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DetailPanel unit control (S-8)', () => {
  const control = (reason: string | null = null) => ({
    offlineReason: vi.fn(() => reason),
    isOutageable: (id: string) => !id.includes('-'),
    onSetOnline: vi.fn(),
  });

  it('offers "Take offline" for an online unit', () => {
    const c = control();
    const res: ResourceView = { id: 'wash1', kind: 'wash', occupantId: null, queueLength: 0, progress: null, online: true };
    render(<DetailPanel selection={{ kind: 'resource', id: 'wash1' }} snapshot={snapshot([], [res])} throughput={tracker()} onClose={() => undefined} unitControl={c} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take offline' }));
    expect(c.onSetOnline).toHaveBeenLastCalledWith('wash1', false);
    expect(screen.queryByText('Offline')).toBeNull();
  });

  it('shows an Offline badge and "Bring online" for an offline unit', () => {
    const c = control();
    const res: ResourceView = { id: 'gate2', kind: 'gate', occupantId: null, queueLength: 0, progress: null, online: false };
    render(<DetailPanel selection={{ kind: 'resource', id: 'gate2' }} snapshot={snapshot([], [res])} throughput={tracker()} onClose={() => undefined} unitControl={c} />);
    expect(screen.getByText('Offline')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bring online' }));
    expect(c.onSetOnline).toHaveBeenLastCalledWith('gate2', true);
  });

  it('disables "Take offline" with the reason for the last open unit', () => {
    const c = control('At least one exit gate must stay open');
    const res: ResourceView = { id: 'gate1', kind: 'gate', occupantId: null, queueLength: 0, progress: null, online: true };
    render(<DetailPanel selection={{ kind: 'resource', id: 'gate1' }} snapshot={snapshot([], [res])} throughput={tracker()} onClose={() => undefined} unitControl={c} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Take offline' }).disabled).toBe(true);
    expect(screen.getByText('At least one exit gate must stay open')).toBeTruthy();
  });

  it('has no toggle for slots or without a unit control', () => {
    const res: ResourceView = { id: 'ev-04', kind: 'slot', occupantId: null, queueLength: 0, progress: null, online: true };
    render(<DetailPanel selection={{ kind: 'resource', id: 'ev-04' }} snapshot={snapshot([], [res])} throughput={tracker()} onClose={() => undefined} unitControl={control()} />);
    expect(screen.queryByRole('button', { name: 'Take offline' })).toBeNull();
    cleanup();
    const wash: ResourceView = { id: 'wash1', kind: 'wash', occupantId: null, queueLength: 0, progress: null, online: true };
    render(<DetailPanel selection={{ kind: 'resource', id: 'wash1' }} snapshot={snapshot([], [wash])} throughput={tracker()} onClose={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Take offline' })).toBeNull();
  });
});
