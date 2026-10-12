import { describe, expect, it } from 'vitest';
import { hub, hubGraph } from '../../../src/layout/hub';
import { areaById, areaOf, hubBounds, unitMarker, unitPose } from '../../../src/layout/positions';

const graph = hubGraph();
const allUnits = Object.values(hub.stations).flatMap((s) => s.units);

describe('unitPose', () => {
  it('places every unit at a parked car’s centre near the end of its park edge', () => {
    for (const u of allUnits) {
      const edge = graph.edge(u.parkEdge);
      const expected = edge.path.pointAt(edge.length - 2.6);
      const pose = unitPose(u.id);
      expect(Math.hypot(pose.x - expected.x, pose.z - expected.z), u.id).toBeLessThan(0.75);
      const h = edge.path.headingAt(edge.length - 0.1);
      expect(Math.abs(Math.atan2(Math.sin(pose.heading - h), Math.cos(pose.heading - h))), u.id).toBeLessThan(0.2);
    }
  });

  it('throws on an unknown unit', () => {
    expect(() => unitPose('nope')).toThrow();
  });
});

describe('unitMarker', () => {
  it('puts each unit’s equipment marker just past the front of its parking spot', () => {
    for (const u of allUnits) {
      const edge = graph.edge(u.parkEdge);
      const end = edge.path.pointAt(edge.length);
      const h = edge.path.headingAt(edge.length - 0.1);
      const m = unitMarker(u.id);
      expect(m.x).toBeCloseTo(end.x + Math.cos(h) * 1.2, 5);
      expect(m.z).toBeCloseTo(end.z + Math.sin(h) * 1.2, 5);
    }
    expect(() => unitMarker('nope')).toThrow();
  });
});

describe('hubBounds', () => {
  it('contains every lane-graph node, grown by the margin', () => {
    const tight = hubBounds(0);
    for (const n of hub.graph.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(tight.minX);
      expect(n.x).toBeLessThanOrEqual(tight.maxX);
      expect(n.z).toBeGreaterThanOrEqual(tight.minZ);
      expect(n.z).toBeLessThanOrEqual(tight.maxZ);
    }
    const loose = hubBounds();
    expect(loose.minX).toBeCloseTo(tight.minX - 20);
    expect(loose.maxZ).toBeCloseTo(tight.maxZ + 20);
  });

  it('contains every camera area', () => {
    const b = hubBounds(0);
    for (const a of hub.areas) {
      expect(a.x).toBeGreaterThan(b.minX);
      expect(a.x).toBeLessThan(b.maxX);
      expect(a.z).toBeGreaterThan(b.minZ);
      expect(a.z).toBeLessThan(b.maxZ);
    }
  });
});

describe('areaById', () => {
  it('finds areas and rejects unknown ids', () => {
    expect(areaById('energy').label).toBe('EV charging & fuel');
    expect(() => areaById('nope' as never)).toThrow();
  });
});

describe('areaOf', () => {
  it('maps points to the nearest area within 70 m, else the overview', () => {
    for (const a of hub.areas) if (a.id !== 'overview') expect(areaOf(a.x, a.z)).toBe(a.id);
    expect(areaOf(145 + 10, 40 - 10)).toBe('energy');
    expect(areaOf(-200, 60)).toBe('overview');
  });
});
