// @vitest-environment jsdom
import { signal } from '@preact/signals';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUICK_HELP, SHORTCUTS } from '../../../src/share/help';
import { Dashboard, type DashboardData, type DashboardProps, type Settings, type TableData } from '../../../src/ui/m2/Dashboard';
import { CopyLinkDialog } from '../../../src/ui/m8/CopyLinkDialog';
import { EmbedHud } from '../../../src/ui/m8/EmbedHud';
import { HelpButton } from '../../../src/ui/m8/HelpButton';
import { HelpDialog } from '../../../src/ui/m8/HelpDialog';
import { KioskCaption } from '../../../src/ui/m8/KioskCaption';
import { Notice } from '../../../src/ui/m8/Notice';
import type { ShareActions, ShareState, UiMode } from '../../../src/ui/m8/types';
import { queueSummary } from '../../../src/ui/scenario';
import { createUiStore } from '../../../src/ui/store';
import { createThroughputTracker } from '../../../src/ui/throughput';
import { snapshot } from './fixtures';

// Requirements SH-7…SH-12a; architecture §21 J5, J10.

afterEach(cleanup);

describe('HelpButton (SH-12a, J10)', () => {
  it('shows quick help on hover and hides it on leave', () => {
    render(<HelpButton onOpen={vi.fn()} hoverCapable />);
    const button = screen.getByRole('button', { name: 'Help' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerEnter(button);
    const tip = screen.getByRole('tooltip');
    for (const s of QUICK_HELP) expect(tip.textContent).toContain(s.action);
    expect(tip.textContent).toContain('Click for full help');
    expect(button.getAttribute('aria-describedby')).toBe(tip.id);
    fireEvent.pointerLeave(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows quick help on keyboard focus too', () => {
    render(<HelpButton onOpen={vi.fn()} hoverCapable />);
    const button = screen.getByRole('button', { name: 'Help' });
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens full help on click', () => {
    const onOpen = vi.fn();
    render(<HelpButton onOpen={onOpen} hoverCapable />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('has no popover on touch-only devices; a tap opens help', () => {
    const onOpen = vi.fn();
    render(<HelpButton onOpen={onOpen} hoverCapable={false} />);
    const button = screen.getByRole('button', { name: 'Help' });
    fireEvent.pointerEnter(button);
    fireEvent.focus(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('HelpDialog (SH-12)', () => {
  it('renders nothing while closed', () => {
    render(<HelpDialog open={false} onClose={vi.fn()} version="0.8.0" buildDate="2026-10-13" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every shortcut, the KPIs, the fictional-brand note and the version', () => {
    render(<HelpDialog open onClose={vi.fn()} version="0.8.0" buildDate="2026-10-13" />);
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    const text = dialog.textContent;
    for (const s of SHORTCUTS) {
      expect(text).toContain(s.keys);
      expect(text).toContain(s.action);
    }
    for (const kpi of ['Turnaround time', 'Fleet utilisation', 'EV state of charge']) expect(text).toContain(kpi);
    expect(text).toMatch(/fictional/i);
    expect(text).toContain('0.8.0');
    expect(text).toContain('2026-10-13');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('closes with Esc and with its button', () => {
    const onClose = vi.fn();
    render(<HelpDialog open onClose={onClose} version="0.8.0" buildDate="2026-10-13" />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('moves focus in, keeps Tab inside, and returns focus on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<HelpDialog open onClose={vi.fn()} version="0.8.0" buildDate="2026-10-13" />);
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Close help' });
    expect(document.activeElement).toBe(close);
    // Close is the only focusable control: Tab and Shift+Tab stay on it.
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
    rerender(<HelpDialog open={false} onClose={vi.fn()} version="0.8.0" buildDate="2026-10-13" />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('CopyLinkDialog (SH-7)', () => {
  it('shows the link selected for manual copy, and closes with Esc or its button', () => {
    const onClose = vi.fn();
    const link = 'https://example.github.io/World-Builder/?area=wash';
    render(<CopyLinkDialog link={link} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Copy this link' });
    const input = within(dialog).getByRole('textbox', { name: 'Link' });
    expect((input as HTMLInputElement).value).toBe(link);
    expect((input as HTMLInputElement).readOnly).toBe(true);
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe(link.length);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('Notice (§13.8)', () => {
  it('is a polite status region showing the text', () => {
    const { rerender } = render(<Notice text="Link copied" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Link copied');
    rerender(<Notice text={null} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

describe('KioskCaption (SH-9, SH-10)', () => {
  const view = { area: 'Wash & maintenance', clock: '09:12', demand: 'Demand ×1.6 · Morning peak', fact: 'Express Wash · 1/2 busy · queue 3', resumeInSec: null };

  it('shows the area, clock, demand and the live fact in a polite region', () => {
    render(<KioskCaption view={view} onExit={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Tour' });
    for (const t of [view.area, view.clock, view.demand, view.fact]) expect(region.textContent).toContain(t);
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(screen.queryByText(/Tour paused/)).toBeNull();
  });

  it('shows the paused chip with the countdown, and exits', () => {
    const onExit = vi.fn();
    render(<KioskCaption view={{ ...view, resumeInSec: 42.3 }} onExit={onExit} />);
    expect(screen.getByText('Tour paused · resumes in 43 s')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('EmbedHud (SH-8)', () => {
  it('shows brand, clock, demand and a safe "Open full view" link', () => {
    render(<EmbedHud clock="14:05" demand="Demand ×1.0 · Midday" fullViewHref="https://example.github.io/World-Builder/?area=wash" />);
    const hud = screen.getByRole('complementary', { name: 'GoldLane Hub' });
    expect(hud.textContent).toContain('GoldLane Hub');
    expect(hud.textContent).toContain('14:05');
    expect(hud.textContent).toContain('Demand ×1.0 · Midday');
    const link = within(hud).getByRole('link', { name: /Open full view/ });
    expect(link.getAttribute('href')).toBe('https://example.github.io/World-Builder/?area=wash');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('Dashboard modes (J5)', () => {
  const share = (overrides: Partial<ShareState> = {}): ShareState => ({
    mode: 'normal',
    kiosk: null,
    fullViewHref: 'https://example.github.io/World-Builder/',
    notice: null,
    copyFallback: null,
    helpOpen: false,
    ...overrides,
  });
  const actions = (): ShareActions => ({
    onCopyLink: vi.fn(),
    onCloseCopyFallback: vi.fn(),
    onStartTour: vi.fn(),
    onExitTour: vi.fn(),
    onScreenshot: vi.fn(),
    onOpenHelp: vi.fn(),
    onCloseHelp: vi.fn(),
  });

  function setup(state: ShareState) {
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
      toasts: [],
      toastOverflow: 0,
    };
    const tables: TableData = { fleet: [], queue: [], checkouts: [] };
    const settings: Settings = { weather: 'clear', dayNight: 'auto', theme: 'dark', speed: 1, labels: true, sound: false, volume: 60, toasts: true };
    const props: DashboardProps = {
      store: createUiStore(),
      data: signal(data),
      tables: signal(tables),
      settings: signal(settings),
      unitIds: ['wash1'],
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
      share: signal(state),
      shareActions: actions(),
      audio: { onSound: vi.fn(), onVolume: vi.fn(), onToasts: vi.fn(), onToast: vi.fn(), onDismissToast: vi.fn(), onHoldToast: vi.fn() },
    };
    render(<Dashboard {...props} />);
    return props;
  }

  const panels = (): Record<string, boolean> => ({
    topBar: screen.queryByRole('banner') !== null,
    kpis: screen.queryByRole('region', { name: 'Key metrics' }) !== null,
    tracker: screen.queryByRole('region', { name: 'Process tracker' }) !== null,
    table: screen.queryByRole('region', { name: 'Live table' }) !== null,
    hud: screen.queryByRole('complementary', { name: 'GoldLane Hub' }) !== null,
    caption: screen.queryByRole('region', { name: 'Tour' }) !== null,
  });

  it('shows the full dashboard in normal mode', () => {
    setup(share());
    expect(panels()).toEqual({ topBar: true, kpis: true, tracker: true, table: true, hud: false, caption: false });
  });

  it.each<[UiMode, Record<string, boolean>]>([
    ['embed', { topBar: false, kpis: false, tracker: false, table: false, hud: true, caption: false }],
    ['kiosk', { topBar: false, kpis: false, tracker: false, table: false, hud: false, caption: true }],
  ])('hides every panel in %s mode', (mode, expected) => {
    setup(share({ mode, kiosk: mode === 'kiosk' ? { area: 'Overview', clock: '09:00', demand: 'Demand ×1.0 · Midday', fact: 'x', resumeInSec: null } : null }));
    expect(panels()).toEqual(expected);
  });

  it('shows the help dialog, the copy fallback and the notice from the share state', () => {
    const props = setup(share({ helpOpen: true, copyFallback: 'https://x/?area=lot', notice: 'Link copied' }));
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Copy this link' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Link copied');
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }));
    expect(props.shareActions.onCloseHelp).toHaveBeenCalledTimes(1);
  });
});
