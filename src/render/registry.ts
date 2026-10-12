/**
 * Maps agent ids to InstancedMesh slots and back (picking, architecture §3).
 * Freed slots are reused, lowest index first.
 */
export interface InstanceRegistry {
  readonly capacity: number;
  /** Highest slot in use + 1, i.e. the instance count to draw. */
  readonly count: number;
  /** Returns the agent's slot, assigning one if needed. Throws when full. */
  assign(id: string): number;
  /** Frees the agent's slot. No-op for unknown ids. */
  release(id: string): void;
  indexOf(id: string): number | undefined;
  idAt(index: number): string | undefined;
}

export function createInstanceRegistry(capacity: number): InstanceRegistry {
  const slots: (string | undefined)[] = [];
  const index = new Map<string, number>();
  let count = 0;
  return {
    capacity,
    get count() {
      return count;
    },
    assign(id) {
      const existing = index.get(id);
      if (existing !== undefined) return existing;
      let i = 0;
      while (i < capacity && slots[i] !== undefined) i++;
      if (i >= capacity) throw new Error(`Instance registry full (${String(capacity)})`);
      slots[i] = id;
      index.set(id, i);
      count = Math.max(count, i + 1);
      return i;
    },
    release(id) {
      const i = index.get(id);
      if (i === undefined) return;
      slots[i] = undefined;
      index.delete(id);
      while (count > 0 && slots[count - 1] === undefined) count--;
    },
    indexOf: (id) => index.get(id),
    idAt: (i) => slots[i],
  };
}
