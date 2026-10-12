export interface ResourceUnit {
  readonly id: string;
  /** Optional class tag, e.g. 'ev' for an EV Ready-lot row. */
  readonly tag?: string;
}

export interface Grant {
  readonly agentId: string;
  readonly unitId: string;
}

/**
 * FIFO pool of bays, chargers, slots or gates (architecture §4.4).
 * A waiting agent whose tag has no free unit does not block later agents
 * whose tag does have one.
 */
export interface ResourcePool {
  readonly capacity: number;
  /** Throws if the agent is already waiting or holding a unit. */
  enqueue(agentId: string, tag?: string): void;
  /** Assigns free units to waiting agents in FIFO order and returns only the new grants. */
  allocate(): readonly Grant[];
  /** Frees a unit. Throws if the unit is unknown or already free. */
  release(unitId: string): void;
  /** Removes a waiting agent. No-op if not waiting. */
  cancel(agentId: string): void;
  occupant(unitId: string): string | null;
  unitOf(agentId: string): string | null;
  waiting(): readonly string[];
  freeCount(tag?: string): number;
  /**
   * Takes a unit offline or back online (S-2, W3). An offline unit is never granted and not
   * counted as free; its current occupant keeps it until release. Throws on an unknown unit.
   */
  setOnline(unitId: string, online: boolean): void;
  isOnline(unitId: string): boolean;
}

interface Waiter {
  readonly agentId: string;
  readonly tag: string | undefined;
}

/** Throws on duplicate unit ids or an empty unit list. */
export function createResourcePool(units: readonly ResourceUnit[]): ResourcePool {
  if (units.length === 0) throw new Error('A resource pool needs at least one unit');
  const occupants = new Map<string, string | null>();
  for (const u of units) {
    if (occupants.has(u.id)) throw new Error(`Duplicate unit id ${u.id}`);
    occupants.set(u.id, null);
  }
  const holding = new Map<string, string>();
  const offline = new Set<string>();
  let queue: Waiter[] = [];

  const matches = (u: ResourceUnit, tag: string | undefined): boolean => tag === undefined || u.tag === tag;
  const free = (u: ResourceUnit): boolean => occupants.get(u.id) === null && !offline.has(u.id);

  return {
    capacity: units.length,
    enqueue(agentId, tag) {
      if (holding.has(agentId) || queue.some((w) => w.agentId === agentId)) {
        throw new Error(`${agentId} is already waiting or holding a unit`);
      }
      queue.push({ agentId, tag });
    },
    allocate() {
      const grants: Grant[] = [];
      queue = queue.filter((w) => {
        const unit = units.find((u) => free(u) && matches(u, w.tag));
        if (!unit) return true;
        occupants.set(unit.id, w.agentId);
        holding.set(w.agentId, unit.id);
        grants.push({ agentId: w.agentId, unitId: unit.id });
        return false;
      });
      return grants;
    },
    release(unitId) {
      const occ = occupants.get(unitId);
      if (occ === undefined) throw new Error(`Unknown unit ${unitId}`);
      if (occ === null) throw new Error(`Unit ${unitId} is already free`);
      occupants.set(unitId, null);
      holding.delete(occ);
    },
    cancel(agentId) {
      queue = queue.filter((w) => w.agentId !== agentId);
    },
    occupant: (unitId) => occupants.get(unitId) ?? null,
    unitOf: (agentId) => holding.get(agentId) ?? null,
    waiting: () => queue.map((w) => w.agentId),
    freeCount: (tag) => units.filter((u) => free(u) && matches(u, tag)).length,
    setOnline(unitId, online) {
      if (!occupants.has(unitId)) throw new Error(`Unknown unit ${unitId}`);
      if (online) offline.delete(unitId);
      else offline.add(unitId);
    },
    isOnline: (unitId) => !offline.has(unitId),
  };
}
