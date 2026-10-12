import { describe, expect, it } from 'vitest';
import { search } from '../../../src/ui/search';
import { agent, snapshot } from './fixtures';

const snap = snapshot([
  agent({ id: 'GL-PGW-04817', plate: '8ABC123' }),
  agent({ id: 'GL-PGW-12345', plate: '7XYZ900', state: 'departing', agreementNo: 'RA-26-0012345' }),
  agent({ id: 'shuttle-1', kind: 'shuttle', cls: null, plate: null }),
]);
const units = ['wash1', 'wash2', 'charger3', 'gate1'];

describe('search (D-2)', () => {
  it('matches vehicle ids, plates and agreement numbers, case-insensitively', () => {
    expect(search('4817', snap, units).map((r) => r.id)).toEqual(['GL-PGW-04817']);
    expect(search('8abc', snap, units).map((r) => r.id)).toEqual(['GL-PGW-04817']);
    const byAgreement = search('ra-26-0012', snap, units);
    expect(byAgreement.map((r) => r.id)).toEqual(['GL-PGW-12345']);
    expect(byAgreement[0]?.detail).toBe('RA-26-0012345 · Departing');
  });

  it('describes vehicle results with plate and status', () => {
    expect(search('GL-PGW-048', snap, units)[0]).toEqual({ kind: 'agent', id: 'GL-PGW-04817', label: 'GL-PGW-04817', detail: 'Plate 8ABC123 · Washing' });
  });

  it('matches facility units by label or id, after vehicles', () => {
    expect(search('wash bay 2', snap, units)).toEqual([{ kind: 'resource', id: 'wash2', label: 'Wash bay 2', detail: 'Facility' }]);
    expect(search('charger3', snap, units).map((r) => r.id)).toEqual(['charger3']);
    // "2" matches plate 8ABC123, GL-PGW-12345 and Wash bay 2: vehicles come first.
    const mixed = search('2', snap, units);
    expect(mixed.map((r) => r.kind)).toEqual(['agent', 'agent', 'resource']);
  });

  it('skips non-fleet agents, blank queries, and respects the limit', () => {
    expect(search('shuttle', snap, units)).toEqual([]);
    expect(search('   ', snap, units)).toEqual([]);
    expect(search('GL-PGW', snap, units, 1)).toHaveLength(1);
  });
});
