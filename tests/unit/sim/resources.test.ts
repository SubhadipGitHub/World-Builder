import { describe, expect, it } from 'vitest';
import { createResourcePool } from '../../../src/sim/resources';

const bays = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `bay${String(i + 1)}` }));

describe('createResourcePool (architecture §4.4)', () => {
  it('reports capacity and rejects empty or duplicate unit lists', () => {
    expect(createResourcePool(bays(2)).capacity).toBe(2);
    expect(() => createResourcePool([])).toThrow();
    expect(() => createResourcePool([{ id: 'x' }, { id: 'x' }])).toThrow();
  });

  it('grants units in FIFO order and only returns new grants', () => {
    const pool = createResourcePool(bays(2));
    pool.enqueue('a');
    pool.enqueue('b');
    pool.enqueue('c');
    expect(pool.allocate()).toEqual([
      { agentId: 'a', unitId: 'bay1' },
      { agentId: 'b', unitId: 'bay2' },
    ]);
    expect(pool.allocate()).toEqual([]);
    expect(pool.waiting()).toEqual(['c']);
  });

  it('never assigns one unit to two agents', () => {
    const pool = createResourcePool(bays(3));
    for (let i = 0; i < 10; i++) pool.enqueue(`v${String(i)}`);
    const granted = pool.allocate();
    expect(new Set(granted.map((g) => g.unitId)).size).toBe(granted.length);
    expect(granted).toHaveLength(3);
  });

  it('release frees the unit for the next waiting agent', () => {
    const pool = createResourcePool(bays(1));
    pool.enqueue('a');
    pool.enqueue('b');
    pool.allocate();
    expect(pool.occupant('bay1')).toBe('a');
    expect(pool.unitOf('a')).toBe('bay1');
    pool.release('bay1');
    expect(pool.occupant('bay1')).toBeNull();
    expect(pool.unitOf('a')).toBeNull();
    expect(pool.allocate()).toEqual([{ agentId: 'b', unitId: 'bay1' }]);
  });

  it('throws when releasing an unknown or free unit, or enqueueing twice', () => {
    const pool = createResourcePool(bays(1));
    expect(() => pool.release('bay1')).toThrow();
    expect(() => pool.release('nope')).toThrow();
    pool.enqueue('a');
    expect(() => pool.enqueue('a')).toThrow();
    pool.allocate();
    expect(() => pool.enqueue('a')).toThrow();
  });

  it('matches tags, and a blocked tag does not block other tags', () => {
    const pool = createResourcePool([
      { id: 'ev1', tag: 'ev' },
      { id: 'sedan1', tag: 'sedan' },
      { id: 'sedan2', tag: 'sedan' },
    ]);
    pool.enqueue('e1', 'ev');
    pool.enqueue('e2', 'ev');
    pool.enqueue('s1', 'sedan');
    expect(pool.allocate()).toEqual([
      { agentId: 'e1', unitId: 'ev1' },
      { agentId: 's1', unitId: 'sedan1' },
    ]);
    expect(pool.waiting()).toEqual(['e2']);
    expect(pool.freeCount('sedan')).toBe(1);
    expect(pool.freeCount('ev')).toBe(0);
    expect(pool.freeCount()).toBe(1);
  });

  it('cancel removes a waiting agent', () => {
    const pool = createResourcePool(bays(1));
    pool.enqueue('a');
    pool.enqueue('b');
    pool.cancel('a');
    pool.cancel('ghost');
    expect(pool.allocate()).toEqual([{ agentId: 'b', unitId: 'bay1' }]);
  });
});
