export interface ZoneClaimant {
  readonly id: string;
  /** Higher wins ties (config/rates.ts priority). */
  readonly priority: number;
  /** Tick when the claimant reached the stop line. */
  readonly arrivedAt: number;
}

/**
 * Exclusive conflict-zone reservations (architecture §4.3).
 * Queue order: arrivedAt ascending, then priority descending, then id ascending.
 * Strict FIFO: only the head of the queue may acquire.
 */
export interface ZoneManager {
  /** Joins the queue. Idempotent for an id that is already queued or holding. */
  request(zoneId: string, claimant: ZoneClaimant): void;
  /**
   * Grants the zone if it is free, the agent heads the queue, and downstreamClear is true.
   * Returns true if the agent holds the zone after the call.
   */
  tryAcquire(zoneId: string, agentId: string, downstreamClear: boolean): boolean;
  /** Throws if the agent is not the holder. */
  release(zoneId: string, agentId: string): void;
  /** Leaves the queue without acquiring. No-op if not queued. */
  cancel(zoneId: string, agentId: string): void;
  holder(zoneId: string): string | null;
  /** Waiting agent ids in grant order, excluding the holder. */
  queue(zoneId: string): readonly string[];
}

interface ZoneState {
  holder: string | null;
  queue: ZoneClaimant[];
}

const order = (a: ZoneClaimant, b: ZoneClaimant): number =>
  a.arrivedAt - b.arrivedAt || b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Throws on use of an unknown zone id. */
export function createZoneManager(zoneIds: readonly string[]): ZoneManager {
  const zones = new Map<string, ZoneState>(zoneIds.map((id) => [id, { holder: null, queue: [] }]));

  const get = (zoneId: string): ZoneState => {
    const z = zones.get(zoneId);
    if (!z) throw new Error(`Unknown zone ${zoneId}`);
    return z;
  };

  return {
    request(zoneId, claimant) {
      const z = get(zoneId);
      if (z.holder === claimant.id || z.queue.some((c) => c.id === claimant.id)) return;
      let i = z.queue.length;
      while (i > 0 && order(z.queue[i - 1] as ZoneClaimant, claimant) > 0) i--;
      z.queue.splice(i, 0, claimant);
    },
    tryAcquire(zoneId, agentId, downstreamClear) {
      const z = get(zoneId);
      if (z.holder === agentId) return true;
      if (z.holder !== null || z.queue[0]?.id !== agentId || !downstreamClear) return false;
      z.holder = agentId;
      z.queue.shift();
      return true;
    },
    release(zoneId, agentId) {
      const z = get(zoneId);
      if (z.holder !== agentId) throw new Error(`${agentId} does not hold zone ${zoneId}`);
      z.holder = null;
    },
    cancel(zoneId, agentId) {
      const z = get(zoneId);
      z.queue = z.queue.filter((c) => c.id !== agentId);
    },
    holder: (zoneId) => get(zoneId).holder,
    queue: (zoneId) => get(zoneId).queue.map((c) => c.id),
  };
}
