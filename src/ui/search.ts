import { notImplemented } from '../shared/notImplemented';
import type { Snapshot } from '../sim/world';

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
export function search(query: string, snapshot: Snapshot, unitIds: readonly string[], limit?: number): readonly SearchResult[] {
  return notImplemented(query, snapshot, unitIds, limit);
}
