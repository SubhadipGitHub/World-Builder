import { describe, expect, it } from 'vitest';
import { FACILITIES, declutter, facilityStatuses, labelName, type FacilityStatus, type LabelRect } from '../../../src/ui/facilities';
import { agent, resource, snapshot } from './fixtures';

// Requirements I-1…I-4, architecture §18 G8.

const byId = (list: readonly FacilityStatus[], id: string): FacilityStatus => {
  const s = list.find((x) => x.id === id);
  if (!s) throw new Error(`no ${id}`);
  return s;
};

describe('facilityStatuses (I-1, I-2)', () => {
  it('reports every facility in order', () => {
    expect(facilityStatuses(snapshot()).map((s) => s.id)).toEqual(FACILITIES.map((f) => f.id));
  });

  it('is OK with a free unit and a short queue', () => {
    const snap = snapshot([], [resource({ id: 'wash1', kind: 'wash', occupantId: 'A', queueLength: 1 }), resource({ id: 'wash2', kind: 'wash', queueLength: 1 })]);
    const wash = byId(facilityStatuses(snap), 'wash');
    expect(wash).toMatchObject({ state: 'ok', busy: 1, total: 2, queue: 1, offline: 0, detail: '1/2 busy · queue 1' });
  });

  it('is Busy with no free unit, or a queue of 3 or more', () => {
    const full = snapshot([], [resource({ id: 'gate1', kind: 'gate', occupantId: 'A' }), resource({ id: 'gate2', kind: 'gate', occupantId: 'B' })]);
    expect(byId(facilityStatuses(full), 'gates')).toMatchObject({ state: 'busy', detail: '2/2 busy · queue 0' });
    const queued = snapshot([], [resource({ id: 'bay1', kind: 'service', queueLength: 3 }), resource({ id: 'bay2', kind: 'service', queueLength: 3 })]);
    expect(byId(facilityStatuses(queued), 'service').state).toBe('busy');
  });

  it('is Offline when any unit is offline, and says how many', () => {
    const snap = snapshot([], [resource({ id: 'wash1', kind: 'wash', online: false }), resource({ id: 'wash2', kind: 'wash', occupantId: 'A', queueLength: 2 })]);
    expect(byId(facilityStatuses(snap), 'wash')).toMatchObject({ state: 'offline', offline: 1, detail: '1 offline · 1/1 busy · queue 2' });
  });

  it('counts staged cars on the Ready lot', () => {
    const slots = Array.from({ length: 4 }, (_, i) => resource({ id: `ev-0${String(i + 1)}`, kind: 'slot', occupantId: i < 3 ? `C${String(i)}` : null }));
    expect(byId(facilityStatuses(snapshot([], slots)), 'lot')).toMatchObject({ state: 'ok', busy: 3, total: 4, detail: '3/4 staged' });
    const full = Array.from({ length: 2 }, (_, i) => resource({ id: `ev-0${String(i + 1)}`, kind: 'slot', occupantId: `C${String(i)}` }));
    expect(byId(facilityStatuses(snapshot([], full)), 'lot').state).toBe('busy');
  });

  it('shows the counter queue on the terminal (I-3)', () => {
    expect(byId(facilityStatuses(snapshot([agent()], [], { counterQueue: 3 })), 'terminal')).toMatchObject({ state: 'ok', queue: 3, detail: 'Counter: 3 waiting' });
    expect(byId(facilityStatuses(snapshot([], [], { counterQueue: 5 })), 'terminal').state).toBe('busy');
    expect(byId(facilityStatuses(snapshot([], [], { counterQueue: 1 })), 'terminal').detail).toBe('Counter: 1 waiting');
  });
});

describe('labelName (I-4)', () => {
  it('reads name, status and detail in words', () => {
    const snap = snapshot([], [resource({ id: 'wash1', kind: 'wash', occupantId: 'A', queueLength: 4 }), resource({ id: 'wash2', kind: 'wash', occupantId: 'B', queueLength: 4 })]);
    expect(labelName(byId(facilityStatuses(snap), 'wash'))).toBe('Express Wash, Busy, 2 of 2 busy, queue 4');
    expect(labelName(byId(facilityStatuses(snapshot([], [], { counterQueue: 2 })), 'terminal'))).toBe('GoldLane Rentals, OK, Counter: 2 waiting');
  });
});

describe('declutter (I-4)', () => {
  const r = (id: LabelRect['id'], priority: number, x: number, y: number): LabelRect => ({ id, priority, x, y, w: 100, h: 30 });

  it('keeps the higher priority label when two overlap', () => {
    expect(declutter([r('lot', 2, 0, 0), r('wash', 6, 50, 10)])).toEqual(new Set(['wash']));
  });

  it('keeps labels that do not overlap', () => {
    expect(declutter([r('lot', 2, 0, 0), r('wash', 6, 200, 0), r('fuel', 4, 0, 100)])).toEqual(new Set(['lot', 'wash', 'fuel']));
  });

  it('breaks priority ties by facility order, deterministically', () => {
    expect(declutter([r('wash', 6, 10, 0), r('return', 6, 0, 0)])).toEqual(new Set(['return']));
  });
});
