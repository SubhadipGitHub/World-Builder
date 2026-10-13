import { describe, expect, it } from 'vitest';
import { kioskFact, screenshotCaption, screenshotFileName } from '../../../src/share/caption';
import { demandText } from '../../../src/ui/demand';
import { facilityStatuses } from '../../../src/ui/facilities';
import { resource, snapshot } from '../ui/fixtures';

// Requirements SH-9, SH-11; architecture §21 J6, J7.

describe('screenshot caption and file name (SH-11)', () => {
  it('captions brand, hub, area, clock and weather', () => {
    expect(screenshotCaption({ area: 'Wash & maintenance', clock: '14:32', weather: 'Heavy rain / slick' })).toBe(
      'GoldLane Hub · Pacific Gateway · Wash & maintenance · 14:32 · Heavy rain / slick',
    );
  });

  it('names the file from the local date and time, zero-padded', () => {
    expect(screenshotFileName(new Date(2026, 9, 13, 9, 5, 7))).toBe('goldlane-hub-20261013-090507.png');
    expect(screenshotFileName(new Date(2027, 0, 1, 23, 59, 59))).toBe('goldlane-hub-20270101-235959.png');
  });
});

describe('kiosk fact per area (SH-9)', () => {
  const snap = snapshot(
    [],
    [
      resource({ id: 'lane1', kind: 'returnLane', occupantId: 'A', queueLength: 2 }),
      resource({ id: 'wash1', kind: 'wash', occupantId: 'B', queueLength: 3 }),
      resource({ id: 'wash2', kind: 'wash' }),
      resource({ id: 'charger1', kind: 'charger', occupantId: 'C' }),
      resource({ id: 'sedan-01', kind: 'slot', occupantId: 'D' }),
      resource({ id: 'sedan-02', kind: 'slot' }),
    ],
    { counterQueue: 4, demand: { factor: 1.62, period: 'Morning peak' } },
  );
  const status = (id: string) => facilityStatuses(snap).find((s) => s.id === id);

  it('shows the demand readout on the overview', () => {
    expect(kioskFact('overview', snap, null)).toBe(demandText(snap.demand));
  });

  it('shows the facility name and status for return, wash and energy', () => {
    expect(kioskFact('return', snap, null)).toBe(`Rental Car Return · ${status('return')?.detail ?? ''}`);
    expect(kioskFact('wash', snap, null)).toBe(`Express Wash · ${status('wash')?.detail ?? ''}`);
    expect(kioskFact('energy', snap, null)).toBe(`EV Fast Charge · ${status('evHub')?.detail ?? ''}`);
  });

  it('adds the counter on the lot', () => {
    expect(kioskFact('lot', snap, null)).toBe(`Ready Lot · ${status('lot')?.detail ?? ''} · Counter: 4 waiting`);
  });

  it('shows the next landing at the airport', () => {
    expect(kioskFact('airport', snap, 40)).toBe('Next landing in 0:40');
    expect(kioskFact('airport', snap, 125.6)).toBe('Next landing in 2:06');
    expect(kioskFact('airport', snap, 0.2)).toBe('Next landing in 0:01');
    expect(kioskFact('airport', snap, null)).toBe('No landings due');
  });
});
