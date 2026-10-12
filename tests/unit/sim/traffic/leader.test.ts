import { describe, expect, it } from 'vitest';
import { findLeader, type LeaderWorld, type Occupant } from '../../../../src/sim/traffic/leader';

function world(lengths: Record<string, number>, occ: Record<string, Occupant[]> = {}, stops: Record<string, number[]> = {}): LeaderWorld {
  return {
    edgeLength: (id) => {
      const l = lengths[id];
      if (l === undefined) throw new Error(`unknown edge ${id}`);
      return l;
    },
    occupants: (id) => occ[id] ?? [],
    stopLines: (id) => stops[id] ?? [],
  };
}

const car = (id: string, s: number, speed = 0, length = 5): Occupant => ({ id, s, length, speed });

describe('findLeader', () => {
  it('finds a leader ahead on the same edge (gap = leader rear − own front)', () => {
    const w = world({ e1: 100 }, { e1: [car('me', 10), car('lead', 30, 4)] });
    const l = findLeader({ id: 'me', route: ['e1'], routeIndex: 0, s: 10, lookAhead: 60 }, w);
    expect(l).toEqual({ id: 'lead', gap: 15, speed: 4 });
  });

  it('ignores itself and agents behind it', () => {
    const w = world({ e1: 100 }, { e1: [car('behind', 5), car('me', 20)] });
    expect(findLeader({ id: 'me', route: ['e1'], routeIndex: 0, s: 20, lookAhead: 60 }, w)).toBeNull();
  });

  it('looks across edge boundaries along its own route', () => {
    const w = world({ e1: 50, e2: 50 }, { e2: [car('lead', 12, 2)] });
    const l = findLeader({ id: 'me', route: ['e1', 'e2'], routeIndex: 0, s: 40, lookAhead: 60 }, w);
    expect(l?.id).toBe('lead');
    expect(l?.gap).toBeCloseTo(10 + (12 - 5));
  });

  it('ignores agents on edges that are not on its route', () => {
    const w = world({ e1: 50, e2: 50, x: 50 }, { x: [car('other', 10)] });
    expect(findLeader({ id: 'me', route: ['e1', 'e2'], routeIndex: 0, s: 40, lookAhead: 60 }, w)).toBeNull();
  });

  it('treats a stop line as a stationary obstacle at the line', () => {
    const w = world({ e1: 50, e2: 50 }, {}, { e2: [8] });
    const l = findLeader({ id: 'me', route: ['e1', 'e2'], routeIndex: 0, s: 45, lookAhead: 60 }, w);
    expect(l).toEqual({ id: null, gap: 13, speed: 0 });
  });

  it('ignores stop lines already behind its front', () => {
    const w = world({ e1: 50 }, {}, { e1: [10] });
    expect(findLeader({ id: 'me', route: ['e1'], routeIndex: 0, s: 20, lookAhead: 60 }, w)).toBeNull();
  });

  it('returns the nearest obstacle when there are several', () => {
    const w = world({ e1: 100 }, { e1: [car('far', 80), car('near', 30)] }, { e1: [50] });
    expect(findLeader({ id: 'me', route: ['e1'], routeIndex: 0, s: 10, lookAhead: 100 }, w)?.id).toBe('near');
  });

  it('returns null beyond the look-ahead distance', () => {
    const w = world({ e1: 200 }, { e1: [car('lead', 150)] });
    expect(findLeader({ id: 'me', route: ['e1'], routeIndex: 0, s: 10, lookAhead: 60 }, w)).toBeNull();
  });

  it('starts from routeIndex, not route[0]', () => {
    const w = world({ e1: 50, e2: 50, e3: 50 }, { e1: [car('passed', 40)], e3: [car('lead', 20)] });
    const l = findLeader({ id: 'me', route: ['e1', 'e2', 'e3'], routeIndex: 1, s: 30, lookAhead: 60 }, w);
    expect(l?.id).toBe('lead');
    expect(l?.gap).toBeCloseTo(20 + 15);
  });
});
