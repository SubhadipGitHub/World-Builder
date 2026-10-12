import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGridlockDetector, findOverlaps, footprintsOverlap, type Footprint } from '../../../src/sim/invariants';

const box = (id: string, x: number, z: number, heading = 0, length = 4, width = 2, parentId?: string): Footprint =>
  parentId === undefined ? { id, x, z, heading, length, width } : { id, x, z, heading, length, width, parentId };

describe('footprintsOverlap (separating axis test)', () => {
  it('detects clear separation and clear overlap', () => {
    expect(footprintsOverlap(box('a', 0, 0), box('b', 10, 0))).toBe(false);
    expect(footprintsOverlap(box('a', 0, 0), box('b', 3, 0))).toBe(true);
  });

  it('does not count touching edges as overlap', () => {
    expect(footprintsOverlap(box('a', 0, 0), box('b', 4, 0))).toBe(false);
    expect(footprintsOverlap(box('a', 0, 0), box('b', 0, 2))).toBe(false);
  });

  it('uses the oriented boxes, not axis-aligned bounds', () => {
    // a is a thin diagonal bar; its AABB is about [-1.59, 1.59]^2.
    const a = box('a', 0, 0, Math.PI / 4, 4, 0.5);
    // Inside a's AABB corner, but 1.84 m from the bar's centreline: no overlap.
    expect(footprintsOverlap(a, box('b', 1.3, -1.3, 0, 0.4, 0.4))).toBe(false);
    // On the bar: overlap.
    expect(footprintsOverlap(a, box('b', 1.0, 0.9, 0, 0.4, 0.4))).toBe(true);
  });

  it('respects heading for long thin boxes', () => {
    const a = box('a', 0, 0, Math.PI / 2, 10, 1); // runs along z
    expect(footprintsOverlap(a, box('b', 0, 4, 0, 1, 1))).toBe(true);
    expect(footprintsOverlap(a, box('b', 4, 0, 0, 1, 1))).toBe(false);
  });
});

describe('findOverlaps', () => {
  it('returns sorted id pairs', () => {
    const pairs = findOverlaps([box('c', 0, 0), box('a', 1, 0), box('b', 20, 0)]);
    expect(pairs).toEqual([['a', 'c']]);
  });

  it('ignores a towed car overlapping its tow truck', () => {
    expect(findOverlaps([box('tow', 0, 0, 0, 6.5, 2.3), box('car', 2, 0, 0, 4.8, 1.9, 'tow')])).toEqual([]);
  });

  it('matches a brute-force check on random layouts', () => {
    const fp = fc.record({
      x: fc.double({ min: -40, max: 40, noNaN: true }),
      z: fc.double({ min: -40, max: 40, noNaN: true }),
      heading: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      length: fc.double({ min: 0.5, max: 9, noNaN: true }),
      width: fc.double({ min: 0.5, max: 2.5, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(fp, { maxLength: 40 }), (raw) => {
        const fps = raw.map((r, i) => ({ id: `f${String(i).padStart(2, '0')}`, ...r }));
        const brute: [string, string][] = [];
        for (let i = 0; i < fps.length; i++) {
          for (let j = i + 1; j < fps.length; j++) {
            if (footprintsOverlap(fps[i]!, fps[j]!)) brute.push([fps[i]!.id, fps[j]!.id]);
          }
        }
        expect(findOverlaps(fps)).toEqual(brute.sort((p, q) => (p[0] + p[1]).localeCompare(q[0] + q[1])));
      }),
      { numRuns: 200 },
    );
  });
});

describe('createGridlockDetector', () => {
  it('flags an agent stationary and not parked for longer than the limit', () => {
    const d = createGridlockDetector(600);
    expect(d.update([{ id: 'v1', speed: 0, parked: false }], 0)).toEqual([]);
    expect(d.update([{ id: 'v1', speed: 0, parked: false }], 600)).toEqual([]);
    expect(d.update([{ id: 'v1', speed: 0, parked: false }], 601)).toEqual(['v1']);
  });

  it('never flags parked agents', () => {
    const d = createGridlockDetector(600);
    d.update([{ id: 'v1', speed: 0, parked: true }], 0);
    expect(d.update([{ id: 'v1', speed: 0, parked: true }], 10_000)).toEqual([]);
  });

  it('resets the timer when the agent moves or parks', () => {
    const d = createGridlockDetector(600);
    d.update([{ id: 'v1', speed: 0, parked: false }], 0);
    d.update([{ id: 'v1', speed: 2, parked: false }], 500);
    expect(d.update([{ id: 'v1', speed: 0, parked: false }], 1_000)).toEqual([]);
    expect(d.update([{ id: 'v1', speed: 0, parked: false }], 1_500)).toEqual([]);
    expect(d.update([{ id: 'v1', speed: 0, parked: false }], 1_601)).toEqual(['v1']);
  });

  it('forgets agents that leave the map', () => {
    const d = createGridlockDetector(600);
    d.update([{ id: 'v1', speed: 0, parked: false }], 0);
    d.update([], 300);
    expect(d.update([{ id: 'v1', speed: 0, parked: false }], 700)).toEqual([]);
  });
});
