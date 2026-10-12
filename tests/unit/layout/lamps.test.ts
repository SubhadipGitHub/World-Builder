import { describe, expect, it } from 'vitest';
import { hub, hubGraph } from '../../../src/layout/hub';
import { LAMP_SPACING, lampPlacements } from '../../../src/layout/lamps';
import type { Edge } from '../../../src/sim/graph/laneGraph';
import type { Vec2 } from '../../../src/sim/types';

const graph = hubGraph();
const lamps = lampPlacements();
const vehicleEdges = graph.edges.filter((e) => !e.kinds?.includes('pedestrian'));
const walkEdges = graph.edges.filter((e) => e.kinds?.includes('pedestrian'));

function distanceToEdge(p: Vec2, e: Edge): number {
  let best = Infinity;
  const pts = e.path.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
  }
  return best;
}

describe('lampPlacements (V-6, P4)', () => {
  it('is deterministic and places street, walkway and flood lamps', () => {
    expect(lampPlacements()).toEqual(lamps);
    expect(lamps.filter((l) => l.kind === 'street').length).toBeGreaterThanOrEqual(60);
    expect(lamps.filter((l) => l.kind === 'walkway').length).toBeGreaterThanOrEqual(3);
    expect(lamps.filter((l) => l.kind === 'flood').length).toBeGreaterThanOrEqual(8);
  });

  it('never stands inside a road corridor', () => {
    for (const l of lamps) {
      for (const e of graph.edges) {
        expect(distanceToEdge(l, e), `lamp at ${l.x.toFixed(1)},${l.z.toFixed(1)} vs ${e.id}`).toBeGreaterThanOrEqual(e.width / 2 + 0.5);
      }
    }
  });

  it('never stands inside a building (the lot surface excepted)', () => {
    for (const l of lamps) {
      for (const b of hub.buildings) {
        if (b.id === 'lot') continue;
        const inside = Math.abs(l.x - b.x) < b.width / 2 && Math.abs(l.z - b.z) < b.depth / 2;
        expect(inside, `lamp at ${l.x.toFixed(1)},${l.z.toFixed(1)} in ${b.id}`).toBe(false);
      }
    }
  });

  it('keeps lamps at least 12 m apart', () => {
    for (let i = 0; i < lamps.length; i++) {
      for (let j = i + 1; j < lamps.length; j++) {
        expect(Math.hypot(lamps[i]!.x - lamps[j]!.x, lamps[i]!.z - lamps[j]!.z)).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('lights almost every stretch of road (a lamp within 32 m of 95% of road points)', () => {
    let covered = 0;
    let total = 0;
    for (const e of vehicleEdges) {
      for (let s = 0; s <= e.length; s += 10) {
        const p = e.path.pointAt(s);
        total++;
        if (lamps.some((l) => Math.hypot(l.x - p.x, l.z - p.z) <= 32)) covered++;
      }
    }
    expect(covered / total).toBeGreaterThanOrEqual(0.95);
  });

  it('lights both sides of main roads', () => {
    for (const e of vehicleEdges.filter((x) => x.speedLimit >= 9 && x.length >= 3 * LAMP_SPACING)) {
      const near = lamps.filter((l) => l.kind === 'street' && distanceToEdge(l, e) <= 8);
      const side = (l: Vec2): number => {
        const mid = e.path.pointAt(e.length / 2);
        const h = e.path.headingAt(e.length / 2);
        return Math.sign(Math.cos(h) * (l.z - mid.z) - Math.sin(h) * (l.x - mid.x));
      };
      expect(new Set(near.map(side)), e.id).toEqual(new Set([1, -1]));
    }
  });

  it('lights the walkway, and street lamps reach out over their road', () => {
    for (const w of walkEdges) expect(lamps.some((l) => distanceToEdge(l, w) <= 6), w.id).toBe(true);
    for (const l of lamps.filter((x) => x.kind === 'street')) {
      const road = vehicleEdges.reduce((best, e) => (distanceToEdge(l, e) < distanceToEdge(l, best) ? e : best));
      const ahead = { x: l.x + Math.cos(l.heading) * 2, z: l.z + Math.sin(l.heading) * 2 };
      expect(distanceToEdge(ahead, road)).toBeLessThan(distanceToEdge(l, road));
    }
  });
});
