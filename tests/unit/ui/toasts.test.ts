import { describe, expect, it } from 'vitest';
import type { Alert } from '../../../src/ui/alerts';
import { CRITICAL_TOAST_MS, MERGE_WINDOW_MS, WARNING_TOAST_MS, createToastStore } from '../../../src/ui/toasts';

// M9 (FE-19, FE-20; architecture F19).

let n = 0;
const alert = (over: Partial<Alert> = {}): Alert => ({
  id: `alert-${String(++n)}`,
  severity: 'warning',
  kind: 'maintenance',
  message: 'Maintenance: tyres on GL-PGW-00001',
  vehicleId: 'GL-PGW-00001',
  unitId: null,
  simTimeSec: 0,
  ...over,
});

describe('createToastStore', () => {
  it('pops up warnings and criticals, never info', () => {
    const s = createToastStore();
    const shown = s.ingest([alert({ severity: 'info', kind: 'tow' }), alert(), alert({ severity: 'critical', vehicleId: 'GL-PGW-00002' })], 0);
    expect(shown.map((t) => t.severity)).toEqual(['warning', 'critical']);
    expect(s.visible().map((t) => t.severity)).toEqual(['critical', 'warning']);
  });

  it('keeps the select target and the message', () => {
    const s = createToastStore();
    s.ingest([alert({ message: 'Wash queue at 7 cars', kind: 'queue', vehicleId: null, unitId: 'wash1' })], 0);
    expect(s.visible()[0]).toMatchObject({ message: 'Wash queue at 7 cars', vehicleId: null, unitId: 'wash1', count: 1 });
  });

  it('merges repeats of the same kind on the same target within 2 minutes (×n)', () => {
    const s = createToastStore();
    s.ingest([alert({ kind: 'queue', vehicleId: null, unitId: 'wash' })], 0);
    const bumped = s.ingest([alert({ kind: 'queue', vehicleId: null, unitId: 'wash', message: 'Wash queue at 8 cars' })], 30_000);
    expect(bumped).toHaveLength(1);
    expect(s.visible()).toHaveLength(1);
    expect(s.visible()[0]).toMatchObject({ count: 2, message: 'Wash queue at 8 cars' });
    // A different target is a different toast.
    s.ingest([alert({ kind: 'queue', vehicleId: null, unitId: 'charger' })], 31_000);
    expect(s.visible()).toHaveLength(2);
  });

  it('starts a new toast after the merge window', () => {
    const s = createToastStore();
    s.ingest([alert({ kind: 'queue', vehicleId: null, unitId: 'wash' })], 0);
    s.tick(WARNING_TOAST_MS - 1);
    s.hold(s.visible()[0]!.id, true, WARNING_TOAST_MS - 1);
    s.ingest([alert({ kind: 'queue', vehicleId: null, unitId: 'wash' })], MERGE_WINDOW_MS + 1);
    expect(s.visible().map((t) => t.count)).toEqual([1, 1]);
  });

  it('shows at most 3, newest first, and counts the rest', () => {
    const s = createToastStore();
    for (let i = 0; i < 5; i++) s.ingest([alert({ vehicleId: `GL-PGW-0000${String(i)}` })], i);
    expect(s.visible()).toHaveLength(3);
    expect(s.visible()[0]!.vehicleId).toBe('GL-PGW-00004');
    expect(s.overflow()).toBe(2);
  });

  it('dismisses warnings after 6 s and criticals after 12 s', () => {
    const s = createToastStore();
    s.ingest([alert(), alert({ severity: 'critical', vehicleId: 'GL-PGW-00009' })], 0);
    s.tick(WARNING_TOAST_MS - 1);
    expect(s.visible()).toHaveLength(2);
    s.tick(WARNING_TOAST_MS + 1);
    expect(s.visible().map((t) => t.severity)).toEqual(['critical']);
    s.tick(CRITICAL_TOAST_MS + 1);
    expect(s.visible()).toHaveLength(0);
  });

  it('pauses the timer while held, then resumes with the time left', () => {
    const s = createToastStore();
    s.ingest([alert()], 0);
    const id = s.visible()[0]!.id;
    s.hold(id, true, 2_000);
    s.tick(60_000);
    expect(s.visible()).toHaveLength(1);
    s.hold(id, false, 60_000);
    s.tick(60_000 + WARNING_TOAST_MS - 2_000 - 1);
    expect(s.visible()).toHaveLength(1);
    s.tick(60_000 + WARNING_TOAST_MS - 2_000 + 1);
    expect(s.visible()).toHaveLength(0);
  });

  it('dismisses on request, promoting a waiting toast', () => {
    const s = createToastStore();
    for (let i = 0; i < 4; i++) s.ingest([alert({ vehicleId: `GL-PGW-0000${String(i)}` })], 0);
    s.dismiss(s.visible()[0]!.id);
    expect(s.visible()).toHaveLength(3);
    expect(s.overflow()).toBe(0);
  });

  it('shows nothing while switched off, and clears on switch-off (FE-20)', () => {
    const s = createToastStore();
    s.ingest([alert()], 0);
    s.setEnabled(false);
    expect(s.visible()).toHaveLength(0);
    expect(s.ingest([alert()], 1)).toEqual([]);
    expect(s.visible()).toHaveLength(0);
    s.setEnabled(true);
    s.ingest([alert({ vehicleId: 'GL-PGW-00077' })], 2);
    expect(s.visible()).toHaveLength(1);
  });

  it('honours a smaller maximum (one toast on a phone)', () => {
    const s = createToastStore({ maxVisible: 1 });
    s.ingest([alert(), alert({ vehicleId: 'GL-PGW-00002' })], 0);
    expect(s.visible()).toHaveLength(1);
    expect(s.overflow()).toBe(1);
  });
});
