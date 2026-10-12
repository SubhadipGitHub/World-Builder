import { describe, expect, it } from 'vitest';
import { buildLaneGraph, type LaneGraphSpec } from '../../../../src/sim/graph/laneGraph';

/*
 *  a ──e1──► b ──e2──► c
 *            │ ▲
 *          e3│ │e5 (carts only)
 *            ▼ │
 *            d ┘──e4──► c   (longer detour)
 */
const spec: LaneGraphSpec = {
  nodes: [
    { id: 'a', x: 0, z: 0 },
    { id: 'b', x: 20, z: 0 },
    { id: 'c', x: 40, z: 0 },
    { id: 'd', x: 20, z: 30 },
  ],
  edges: [
    { id: 'e1', from: 'a', to: 'b', speedLimit: 8 },
    { id: 'e2', from: 'b', to: 'c', speedLimit: 8 },
    { id: 'e3', from: 'b', to: 'd', speedLimit: 8 },
    { id: 'e4', from: 'd', to: 'c', speedLimit: 8 },
    { id: 'e5', from: 'd', to: 'b', via: [{ x: 26, z: 15 }], speedLimit: 5, kinds: ['cart'] },
  ],
};

describe('buildLaneGraph: structure', () => {
  it('builds edges with geometry from node positions and via points', () => {
    const g = buildLaneGraph(spec);
    expect(g.edges).toHaveLength(5);
    expect(g.edge('e1').length).toBeCloseTo(20);
    expect(g.edge('e1').width).toBe(3.5);
    expect(g.edge('e1').kinds).toBeNull();
    expect(g.edge('e5').kinds).toEqual(['cart']);
    const viaLen = Math.hypot(6, 15) * 2;
    expect(g.edge('e5').length).toBeCloseTo(viaLen);
  });

  it('lists outgoing edges per node', () => {
    const g = buildLaneGraph(spec);
    expect(g.outgoing('b').map((e) => e.id).sort()).toEqual(['e2', 'e3']);
    expect(g.outgoing('c')).toEqual([]);
  });

  it('throws on unknown edge ids, duplicate ids and unknown node references', () => {
    const g = buildLaneGraph(spec);
    expect(() => g.edge('nope')).toThrow();
    expect(() => buildLaneGraph({ ...spec, edges: [...spec.edges, { id: 'e1', from: 'a', to: 'b', speedLimit: 1 }] })).toThrow();
    expect(() => buildLaneGraph({ ...spec, nodes: [...spec.nodes, { id: 'a', x: 1, z: 1 }] })).toThrow();
    expect(() => buildLaneGraph({ nodes: spec.nodes, edges: [{ id: 'x', from: 'a', to: 'zz', speedLimit: 1 }] })).toThrow();
  });
});

describe('buildLaneGraph: routing', () => {
  it('finds the shortest route, inclusive of both ends', () => {
    const g = buildLaneGraph(spec);
    expect(g.route('e1', 'e2')).toEqual(['e1', 'e2']);
    expect(g.route('e1', 'e4')).toEqual(['e1', 'e3', 'e4']);
    expect(g.route('e2', 'e2')).toEqual(['e2']);
  });

  it('returns null when the target is unreachable', () => {
    const g = buildLaneGraph(spec);
    expect(g.route('e2', 'e1')).toBeNull();
  });

  it('respects kind restrictions', () => {
    const g = buildLaneGraph(spec);
    expect(g.route('e3', 'e2', 'cart')).toEqual(['e3', 'e5', 'e2']);
    expect(g.route('e3', 'e2', 'fleet')).toBeNull();
    expect(g.route('e3', 'e2')).toEqual(['e3', 'e5', 'e2']);
  });
});

describe('buildLaneGraph: conflict zones (architecture §4.3)', () => {
  it('creates one zone where two roads cross, with an interval around the crossing on each', () => {
    const g = buildLaneGraph({
      nodes: [
        { id: 'w', x: -20, z: 0 },
        { id: 'e', x: 20, z: 0 },
        { id: 'n', x: 0, z: -20 },
        { id: 's', x: 0, z: 20 },
      ],
      edges: [
        { id: 'we', from: 'w', to: 'e', speedLimit: 8 },
        { id: 'ns', from: 'n', to: 's', speedLimit: 8 },
      ],
    });
    expect(g.zones).toHaveLength(1);
    const zone = g.zones[0]!;
    expect(zone.intervals.map((i) => i.edgeId).sort()).toEqual(['ns', 'we']);
    for (const iv of zone.intervals) {
      // Corridors are 3.5 m wide, so the conflict spans at least 20 ± 1.75 m.
      expect(iv.sEnter).toBeLessThanOrEqual(20 - 1.75 + 1e-6);
      expect(iv.sExit).toBeGreaterThanOrEqual(20 + 1.75 - 1e-6);
      expect(iv.sEnter).toBeGreaterThan(10);
      expect(iv.sExit).toBeLessThan(30);
    }
    expect(g.zonesOn('we')).toHaveLength(1);
  });

  it('creates a zone at a merge (two edges into one node)', () => {
    const g = buildLaneGraph({
      nodes: [
        { id: 'l', x: -20, z: -10 },
        { id: 'r', x: -20, z: 10 },
        { id: 'm', x: 0, z: 0 },
        { id: 'o', x: 20, z: 0 },
      ],
      edges: [
        { id: 'lm', from: 'l', to: 'm', speedLimit: 8 },
        { id: 'rm', from: 'r', to: 'm', speedLimit: 8 },
        { id: 'mo', from: 'm', to: 'o', speedLimit: 8 },
      ],
    });
    const merge = g.zones.find((z) => z.intervals.some((i) => i.edgeId === 'lm') && z.intervals.some((i) => i.edgeId === 'rm'));
    expect(merge).toBeDefined();
    const lm = merge!.intervals.find((i) => i.edgeId === 'lm')!;
    expect(lm.sExit).toBeCloseTo(g.edge('lm').length, 0);
  });

  it('does not create zones between edges in series or between well-separated parallel lanes', () => {
    const g = buildLaneGraph({
      nodes: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 20, z: 0 },
        { id: 'c', x: 40, z: 0 },
        { id: 'p', x: 0, z: 4 },
        { id: 'q', x: 40, z: 4 },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', speedLimit: 8 },
        { id: 'bc', from: 'b', to: 'c', speedLimit: 8 },
        { id: 'pq', from: 'p', to: 'q', speedLimit: 8 },
      ],
    });
    expect(g.zones).toEqual([]);
  });

  it('does not create zones between segments of the same lane joined by a short hop', () => {
    // a→b and c→d are collinear, 3 m apart end-to-start, joined by b→c: same lane, ordered traffic.
    const g = buildLaneGraph({
      nodes: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 10, z: 0 },
        { id: 'c', x: 13, z: 0 },
        { id: 'd', x: 23, z: 0 },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', speedLimit: 8 },
        { id: 'bc', from: 'b', to: 'c', speedLimit: 8 },
        { id: 'cd', from: 'c', to: 'd', speedLimit: 8 },
      ],
    });
    expect(g.zones).toEqual([]);
  });

  it('uses per-edge width so adjacent parking stubs do not conflict', () => {
    const g = buildLaneGraph({
      nodes: [
        { id: 's1a', x: 0, z: 0 },
        { id: 's1b', x: 0, z: 5 },
        { id: 's2a', x: 2.7, z: 0 },
        { id: 's2b', x: 2.7, z: 5 },
      ],
      edges: [
        { id: 'slot1', from: 's1a', to: 's1b', speedLimit: 2, width: 2.4 },
        { id: 'slot2', from: 's2a', to: 's2b', speedLimit: 2, width: 2.4 },
      ],
    });
    expect(g.zones).toEqual([]);
  });

  it('never creates zones between edges of the same group (mutually exclusive by reservation)', () => {
    const cross = (groupA?: string, groupB?: string) =>
      buildLaneGraph({
        nodes: [
          { id: 'w', x: -20, z: 0 },
          { id: 'e', x: 20, z: 0 },
          { id: 'n', x: 0, z: -20 },
          { id: 's', x: 0, z: 20 },
        ],
        edges: [
          { id: 'we', from: 'w', to: 'e', speedLimit: 8, ...(groupA ? { group: groupA } : {}) },
          { id: 'ns', from: 'n', to: 's', speedLimit: 8, ...(groupB ? { group: groupB } : {}) },
        ],
      });
    expect(cross('bay', 'bay').zones).toEqual([]);
    expect(cross('bay', 'other').zones).toHaveLength(1);
    expect(cross('bay').zones).toHaveLength(1);
  });

  it('merges conflicts that overlap on a shared edge into one zone', () => {
    // Three roads through the same point.
    const g = buildLaneGraph({
      nodes: [
        { id: 'w', x: -20, z: 0 },
        { id: 'e', x: 20, z: 0 },
        { id: 'n', x: 0, z: -20 },
        { id: 's', x: 0, z: 20 },
        { id: 'nw', x: -14, z: -14 },
        { id: 'se', x: 14, z: 14 },
      ],
      edges: [
        { id: 'we', from: 'w', to: 'e', speedLimit: 8 },
        { id: 'ns', from: 'n', to: 's', speedLimit: 8 },
        { id: 'diag', from: 'nw', to: 'se', speedLimit: 8 },
      ],
    });
    expect(g.zones).toHaveLength(1);
    expect(g.zones[0]!.intervals).toHaveLength(3);
  });
});
