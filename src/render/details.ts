import type { Snapshot } from '../sim/world';

export interface DetailStates {
  /** Wash units whose brushes spin: occupied and mid-cycle (progress set). */
  readonly spinningWash: ReadonlySet<string>;
  /** Service bays whose roll-up door is open: occupied. */
  readonly openDoors: ReadonlySet<string>;
  /** Gates whose barrier is up: occupied and not mid-checkout (progress null). */
  readonly raisedBarriers: ReadonlySet<string>;
  /** Every charger: 'charging' while occupied and mid-cycle, else 'idle'. */
  readonly chargers: ReadonlyMap<string, 'idle' | 'charging'>;
  /** The tow truck's beacon flashes while it carries a car. */
  readonly towBeacon: boolean;
}

/** Live building details from existing snapshot data (V-9, P9); no simulation changes. */
export function detailStates(snapshot: Snapshot): DetailStates {
  const spinningWash = new Set<string>();
  const openDoors = new Set<string>();
  const raisedBarriers = new Set<string>();
  const chargers = new Map<string, 'idle' | 'charging'>();
  for (const r of snapshot.resources) {
    const occupied = r.occupantId !== null;
    switch (r.kind) {
      case 'wash':
        if (occupied && r.progress !== null) spinningWash.add(r.id);
        break;
      case 'service':
        if (occupied) openDoors.add(r.id);
        break;
      case 'gate':
        if (occupied && r.progress === null) raisedBarriers.add(r.id);
        break;
      case 'charger':
        chargers.set(r.id, occupied && r.progress !== null ? 'charging' : 'idle');
        break;
      default:
        break;
    }
  }
  return { spinningWash, openDoors, raisedBarriers, chargers, towBeacon: snapshot.agents.some((a) => a.parentId !== null) };
}
