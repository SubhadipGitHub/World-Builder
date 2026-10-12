import type { Snapshot } from '../sim/world';
import { stateLabel, unitLabel } from './format';

export interface SearchResult {
  readonly kind: 'agent' | 'resource';
  readonly id: string;
  /** Main line, e.g. a vehicle id or "Wash bay 2". */
  readonly label: string;
  /** Secondary line, e.g. "Plate 8ABC123 · Washing" or "RA-26-0012345". */
  readonly detail: string;
}

/**
 * Search (D-2): case-insensitive partial match on fleet vehicle id, plate and agreement #,
 * and on unit labels and ids. Fleet results first, then units; at most `limit` (default 8).
 * Blank or whitespace queries return nothing.
 */
export function search(query: string, snapshot: Snapshot, unitIds: readonly string[], limit = 8): readonly SearchResult[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const has = (text: string | null): boolean => text !== null && text.toLowerCase().includes(q);
  const out: SearchResult[] = [];
  for (const a of snapshot.agents) {
    if (out.length >= limit) return out;
    if (a.kind !== 'fleet') continue;
    const byAgreement = has(a.agreementNo);
    if (!has(a.id) && !has(a.plate) && !byAgreement) continue;
    const status = a.state ? stateLabel(a.state) : '';
    out.push({
      kind: 'agent',
      id: a.id,
      label: a.id,
      detail: byAgreement && a.agreementNo ? `${a.agreementNo} · ${status}` : `Plate ${a.plate ?? '—'} · ${status}`,
    });
  }
  for (const id of unitIds) {
    if (out.length >= limit) return out;
    const label = unitLabel(id);
    if (has(label) || has(id)) out.push({ kind: 'resource', id, label, detail: 'Facility' });
  }
  return out;
}
