// @vitest-environment jsdom
import { signal } from '@preact/signals';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hub } from '../../../src/layout/hub';
import type { AgentView } from '../../../src/sim/world';
import { DetailPanel } from '../../../src/ui/m1/DetailPanel';
import { Dashboard, type DashboardData, type DashboardProps, type Settings } from '../../../src/ui/m2/Dashboard';
import { KpiCards } from '../../../src/ui/m2/KpiCards';
import { TopBar, type TopBarProps } from '../../../src/ui/m2/TopBar';
import type { ShareState, UiMode } from '../../../src/ui/m8/types';
import { SoundButton } from '../../../src/ui/m9/SoundButton';
import { Toasts, type ToastsProps } from '../../../src/ui/m9/Toasts';
import { VolumeSlider } from '../../../src/ui/m9/VolumeSlider';
import { queueSummary } from '../../../src/ui/scenario';
import { createUiStore } from '../../../src/ui/store';
import { createThroughputTracker } from '../../../src/ui/throughput';
import type { Toast } from '../../../src/ui/toasts';
import { agent, snapshot } from './fixtures';

// M9 components (FE-8, FE-9, FE-18…FE-20; architecture F21).

afterEach(cleanup);

const toast = (over: Partial<Toast> = {}): Toast => ({
  id: 't1',
  alertId: 'alert-1',
  severity: 'warning',
  message: 'GL-PGW-04817 · Crew-cab pickup · scheduled service (4,500 mi)',
  count: 1,
  vehicleId: 'GL-PGW-04817',
  unitId: null,
  ...over,
});

function renderToasts(over: Partial<ToastsProps> = {}): ToastsProps {
  const props: ToastsProps = { toasts: [toast()], overflow: 0, onSelect: vi.fn(), onDismiss: vi.fn(), onHold: vi.fn(), onMore: vi.fn(), ...over };
  render(<Toasts {...props} />);
  return props;
}

describe('Toasts (FE-19, FE-20, F21)', () => {
  it('announces warnings politely and criticals assertively', () => {
    renderToasts({ toasts: [toast({ id: 'c', severity: 'critical', message: 'Severe damage on GL-PGW-00002 — tow requested' }), toast()] });
    expect(within(screen.getByRole('alert')).getByText(/Severe damage/)).toBeTruthy();
    expect(within(screen.getByRole('status')).getByText(/scheduled service/)).toBeTruthy();
  });

  it('selects the target on click and dismisses with ×', () => {
    const props = renderToasts();
    fireEvent.click(screen.getByRole('button', { name: /scheduled service/ }));
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss alert' }));
    expect(props.onDismiss).toHaveBeenCalledWith('t1');
  });

  it('pauses on hover and focus', () => {
    const props = renderToasts();
    const item = screen.getByRole('button', { name: /scheduled service/ });
    fireEvent.pointerEnter(item);
    expect(props.onHold).toHaveBeenLastCalledWith('t1', true);
    fireEvent.pointerLeave(item);
    expect(props.onHold).toHaveBeenLastCalledWith('t1', false);
    fireEvent.focus(item);
    expect(props.onHold).toHaveBeenLastCalledWith('t1', true);
  });

  it('shows merged repeats as ×n and the overflow as "+n more"', () => {
    const props = renderToasts({ toasts: [toast({ count: 3 })], overflow: 4 });
    expect(screen.getByText('×3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+4 more alerts' }));
    expect(props.onMore).toHaveBeenCalled();
  });

  it('renders nothing without toasts', () => {
    renderToasts({ toasts: [], overflow: 0 });
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SoundButton and VolumeSlider (FE-18)', () => {
  it('toggles sound with aria-pressed', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<SoundButton on={false} onToggle={onToggle} />);
    const b = screen.getByRole('button', { name: 'Sound' });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(b);
    expect(onToggle).toHaveBeenCalledWith(true);
    rerender(<SoundButton on onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Sound' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Sound' }));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('sets the volume from 0 to 100', () => {
    const onChange = vi.fn();
    render(<VolumeSlider value={60} onChange={onChange} />);
    const s = screen.getByRole<HTMLInputElement>('slider', { name: 'Volume' });
    expect(s.value).toBe('60');
    expect(s.min).toBe('0');
    expect(s.max).toBe('100');
    fireEvent.input(s, { target: { value: '35' } });
    expect(onChange).toHaveBeenCalledWith(35);
  });
});

describe('TopBar sound and pop-up controls (FE-18, FE-20)', () => {
  function setup(over: Partial<TopBarProps> = {}): TopBarProps {
    const props: TopBarProps = {
      snapshot: snapshot([agent()]),
      unitIds: [],
      areas: hub.areas,
      activeArea: 'overview',
      onArea: vi.fn(),
      weather: 'clear',
      onWeather: vi.fn(),
      dayNight: 'auto',
      onDayNight: vi.fn(),
      theme: 'dark',
      onTheme: vi.fn(),
      alerts: [],
      unread: 0,
      onOpenAlerts: vi.fn(),
      onAlert: vi.fn(),
      onPick: vi.fn(),
      speed: 1,
      onSpeed: vi.fn(),
      chips: [],
      onOpenWhatIf: vi.fn(),
      labelsOn: true,
      demand: null,
      onLabels: vi.fn(),
      onCopyLink: vi.fn(),
      onStartTour: vi.fn(),
      onScreenshot: vi.fn(),
      onOpenHelp: vi.fn(),
      sound: false,
      onSound: vi.fn(),
      volume: 60,
      onVolume: vi.fn(),
      toastsOn: true,
      onToasts: vi.fn(),
      ...over,
    };
    render(<TopBar {...props} />);
    return props;
  }

  it('has a speaker button in the bar', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sound' }));
    expect(props.onSound).toHaveBeenCalledWith(true);
  });

  it('has a "Pop-up alerts" switch and a volume slider in the user menu', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const sw = screen.getByRole('switch', { name: 'Pop-up alerts' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(props.onToasts).toHaveBeenCalledWith(false);
    fireEvent.input(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '80' } });
    expect(props.onVolume).toHaveBeenCalledWith(80);
  });
});

describe('KpiCards with revenue (FE-8)', () => {
  it('shows the revenue card with its at-risk line and delta', () => {
    render(
      <KpiCards
        cards={[{ id: 'revenue', label: 'Revenue today', value: '$18,420', sub: 'At risk $1,240 · 18 waiting > 20 min', trend: 'up' }]}
        deltas={{ revenue: { text: '−$2.1k vs normal', tone: 'bad' } }}
      />,
    );
    const region = screen.getByRole('region', { name: 'Key metrics' });
    expect(region.textContent).toContain('Revenue today');
    expect(region.textContent).toContain('$18,420');
    expect(region.textContent).toContain('At risk $1,240');
    expect(region.textContent).toContain('−$2.1k vs normal');
  });
});

describe('DetailPanel rate and service lines (FE-9)', () => {
  const row = (label: string): string | null => {
    const region = screen.getByRole('region', { name: 'Details' });
    return within(region).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? null;
  };

  it('shows the daily rate and the miles to the next service', () => {
    const car: AgentView = agent({ cls: 'pickup', socPct: null, fuelPct: 40, ratePerDay: 84, milesToService: 1_240 });
    render(<DetailPanel selection={{ kind: 'agent', id: car.id }} snapshot={snapshot([car])} throughput={createThroughputTracker()} onClose={() => undefined} />);
    expect(row('Model')).toBe('Crew-cab pickup');
    expect(row('Rate')).toBe('$84/day');
    expect(row('Next service')).toBe('in 1,240 mi (every 4,500 mi)');
  });

  it('says when a service is due', () => {
    const car: AgentView = agent({ cls: 'economy', socPct: null, fuelPct: 40, ratePerDay: 42, milesToService: 0 });
    render(<DetailPanel selection={{ kind: 'agent', id: car.id }} snapshot={snapshot([car])} throughput={createThroughputTracker()} onClose={() => undefined} />);
    expect(row('Next service')).toBe('Due now (every 5,000 mi)');
  });
});

describe('Dashboard pop-up alerts (FE-19, FE-20)', () => {
  function setup(mode: UiMode, toasts: readonly Toast[], toastsOn = true): DashboardProps {
    const snap = snapshot();
    const data: DashboardData = {
      snapshot: snap,
      cards: [],
      alerts: [],
      unread: 0,
      steps: null,
      stageCounts: null,
      deltas: {},
      queues: queueSummary(snap),
      baselineQueues: queueSummary(snap),
      facilities: [],
      compactLabels: false,
      places: [],
      toasts,
      toastOverflow: 0,
    };
    const settings: Settings = { weather: 'clear', dayNight: 'auto', theme: 'dark', speed: 1, labels: true, sound: false, volume: 60, toasts: toastsOn };
    const share: ShareState = {
      mode,
      kiosk: mode === 'kiosk' ? { area: 'Overview', clock: '09:00', demand: 'Demand ×1.0 · Midday', fact: 'x', resumeInSec: null } : null,
      fullViewHref: '',
      notice: null,
      copyFallback: null,
      helpOpen: false,
    };
    const props: DashboardProps = {
      store: createUiStore(),
      data: signal(data),
      tables: signal({ fleet: [], queue: [], checkouts: [] }),
      settings: signal(settings),
      unitIds: [],
      throughput: createThroughputTracker(),
      clockAt: () => '09:00',
      onArea: vi.fn(),
      onWeather: vi.fn(),
      onDayNight: vi.fn(),
      onTheme: vi.fn(),
      onOpenAlerts: vi.fn(),
      onPick: vi.fn(),
      onSelectVehicle: vi.fn(),
      onSelectUnit: vi.fn(),
      scenario: {
        outages: [],
        offlineReason: () => null,
        isOutageable: () => false,
        onSurge: vi.fn(),
        onCrew: vi.fn(),
        onSetOnline: vi.fn(),
        onPreset: vi.fn(),
        onReset: vi.fn(),
        onSpeed: vi.fn(),
      },
      onLabels: vi.fn(),
      onFacility: vi.fn(),
      onPlace: vi.fn(),
      share: signal(share),
      shareActions: {
        onCopyLink: vi.fn(),
        onCloseCopyFallback: vi.fn(),
        onStartTour: vi.fn(),
        onExitTour: vi.fn(),
        onScreenshot: vi.fn(),
        onOpenHelp: vi.fn(),
        onCloseHelp: vi.fn(),
      },
      audio: { onSound: vi.fn(), onVolume: vi.fn(), onToasts: vi.fn(), onToast: vi.fn(), onDismissToast: vi.fn(), onHoldToast: vi.fn() },
    };
    render(<Dashboard {...props} />);
    return props;
  }

  it('shows toasts in normal mode and routes a click to onToast', () => {
    const props = setup('normal', [toast()]);
    fireEvent.click(screen.getByRole('button', { name: /scheduled service/ }));
    expect(props.audio.onToast).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it.each<UiMode>(['embed', 'kiosk'])('hides toasts in %s mode', (mode) => {
    setup(mode, [toast()]);
    expect(screen.queryByRole('button', { name: /scheduled service/ })).toBeNull();
  });

  it('hides toasts when "Pop-up alerts" is off', () => {
    setup('normal', [toast()], false);
    expect(screen.queryByRole('button', { name: /scheduled service/ })).toBeNull();
  });

  it('shows the speaker button in the top bar', () => {
    setup('normal', []);
    expect(screen.getByRole('button', { name: 'Sound' })).toBeTruthy();
  });
});
