import { describe, expect, it } from 'vitest';
import { parseLink } from '../../../src/share/link';
import type { SimEvent } from '../../../src/sim/events';
import { createAlertFeed } from '../../../src/ui/alerts';
import { formatMoney, formatMoneyShort } from '../../../src/ui/format';
import { DEFAULT_VOLUME, VOLUME_KEY, loadNumber, saveNumber } from '../../../src/ui/prefs';
import { kpiDelta } from '../../../src/ui/scenario';
import { createCheckoutLog } from '../../../src/ui/tables';
import type { ThemeStorage } from '../../../src/ui/theme';

// M9 UI rules (FE-5, FE-8, FE-9, FE-18…FE-20; architecture F19, F20, F22).

describe('formatMoney (FE-8)', () => {
  it('shows whole US dollars with separators', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(84)).toBe('$84');
    expect(formatMoney(18_420)).toBe('$18,420');
    expect(formatMoney(1_234_567.6)).toBe('$1,234,568');
  });

  it('shortens signed deltas', () => {
    expect(formatMoneyShort(-2_140)).toBe('−$2.1k');
    expect(formatMoneyShort(640)).toBe('+$640');
    expect(formatMoneyShort(12_500)).toBe('+$12.5k');
    expect(formatMoneyShort(-999)).toBe('−$999');
  });
});

describe('kpiDelta for revenue (FE-8, F22)', () => {
  it('reads in dollars, up is good', () => {
    expect(kpiDelta('revenue', 20_000, 17_900)).toEqual({ text: '+$2.1k vs normal', tone: 'good' });
    expect(kpiDelta('revenue', 15_000, 17_400)).toEqual({ text: '−$2.4k vs normal', tone: 'bad' });
  });

  it('treats less than the larger of $500 and 3% as noise', () => {
    expect(kpiDelta('revenue', 1_400, 1_000)).toEqual({ text: '≈ normal', tone: 'neutral' });
    // 3% of 40,000 is 1,200: a 1,000 gap is noise even though it is over $500.
    expect(kpiDelta('revenue', 41_000, 40_000)).toEqual({ text: '≈ normal', tone: 'neutral' });
    expect(kpiDelta('revenue', 41_300, 40_000)?.tone).toBe('good');
  });
});

describe('alerts for M9 (FE-9, F20)', () => {
  const flagged = (reason: 'tyres' | 'interval', severe = false): SimEvent => ({
    type: 'maintenanceFlagged',
    vehicleId: 'GL-PGW-04817',
    cls: 'pickup',
    reason,
    severe,
    simTimeSec: 10,
  });

  it('names a scheduled service with the model and its interval', () => {
    const feed = createAlertFeed();
    feed.ingest([flagged('interval')]);
    expect(feed.list()[0]).toMatchObject({ severity: 'warning', kind: 'service', message: 'GL-PGW-04817 · Crew-cab pickup · scheduled service (4,500 mi)' });
  });

  it('tags every alert with its kind', () => {
    const feed = createAlertFeed();
    feed.ingest([
      flagged('tyres'),
      flagged('tyres', true),
      { type: 'towDispatched', vehicleId: 'GL-PGW-04817', towId: 'tow1', simTimeSec: 11 },
      { type: 'queueOverflow', resource: 'wash', length: 7, simTimeSec: 12 },
    ]);
    expect(feed.list().map((a) => a.kind)).toEqual(['queue', 'tow', 'maintenance', 'maintenance']);
  });

  it('returns the alerts each ingest created, oldest first (fed to the toasts)', () => {
    const feed = createAlertFeed();
    const created = feed.ingest([flagged('tyres'), { type: 'queueOverflow', resource: 'wash', length: 7, simTimeSec: 12 }]);
    expect(created.map((a) => a.kind)).toEqual(['maintenance', 'queue']);
    expect(feed.ingest([])).toEqual([]);
  });
});

describe('checkout log class and rate (FE-9)', () => {
  it('adds the model and the booked daily rate', () => {
    const log = createCheckoutLog();
    log.ingest([{ type: 'checkout', vehicleId: 'GL-PGW-00001', agreementNo: 'RA-26-0000001', tier: 'Gold', gateId: 'gate2', cls: 'pickup', ratePerDay: 84, simTimeSec: 5 }]);
    expect(log.rows()[0]).toMatchObject({ model: 'Crew-cab pickup', rate: '$84/day', gate: 'Exit gate 2' });
  });
});

describe('volume preference (FE-18)', () => {
  const memory = (init: Record<string, string> = {}): ThemeStorage & { data: Record<string, string> } => {
    const data = { ...init };
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  };
  const broken: ThemeStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };

  it('defaults to 60 and remembers a whole number in range', () => {
    const s = memory();
    expect(loadNumber(s, VOLUME_KEY, DEFAULT_VOLUME, 0, 100)).toBe(60);
    saveNumber(s, VOLUME_KEY, 35);
    expect(s.data[VOLUME_KEY]).toBe('35');
    expect(loadNumber(s, VOLUME_KEY, DEFAULT_VOLUME, 0, 100)).toBe(35);
  });

  it('clamps out-of-range values and ignores junk', () => {
    expect(loadNumber(memory({ [VOLUME_KEY]: '250' }), VOLUME_KEY, 60, 0, 100)).toBe(100);
    expect(loadNumber(memory({ [VOLUME_KEY]: '-4' }), VOLUME_KEY, 60, 0, 100)).toBe(0);
    expect(loadNumber(memory({ [VOLUME_KEY]: 'loud' }), VOLUME_KEY, 60, 0, 100)).toBe(60);
    expect(loadNumber(memory({ [VOLUME_KEY]: '' }), VOLUME_KEY, 60, 0, 100)).toBe(60);
    expect(loadNumber(memory({ [VOLUME_KEY]: '42.7' }), VOLUME_KEY, 60, 0, 100)).toBe(43);
  });

  it('never throws on blocked storage', () => {
    expect(loadNumber(broken, VOLUME_KEY, 60, 0, 100)).toBe(60);
    expect(() => saveNumber(broken, VOLUME_KEY, 10)).not.toThrow();
    expect(loadNumber(null, VOLUME_KEY, 60, 0, 100)).toBe(60);
  });
});

describe('deep links accept the new weather modes (FE-6)', () => {
  it('parses fog and storm', () => {
    expect(parseLink('?weather=fog').state.weather).toBe('fog');
    expect(parseLink('?weather=storm').state.weather).toBe('storm');
  });
});
