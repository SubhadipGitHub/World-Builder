import { describe, expect, it } from 'vitest';
import { distanceToEdge } from '../../../src/layout/geometry';
import { hub, hubGraph } from '../../../src/layout/hub';
import { lampPlacements } from '../../../src/layout/lamps';
import { hubBounds } from '../../../src/layout/positions';
import { FENCE_MARGIN, GANTRY_CLEARANCE, PATROL_MARGIN, sitePlan, type FenceOpening } from '../../../src/layout/site';
import type { Vec2 } from '../../../src/sim/types';

// Requirements §10 (B-2, B-3, SEC-1…SEC-4, ENV-1), architecture §18 G1.

const plan = sitePlan();
const graph = hubGraph();
const vehicleEdges = graph.edges.filter((e) => !e.kinds?.includes('pedestrian'));
const lamps = lampPlacements();
const roads = hubBounds(0);

const inCorridor = (p: Vec2, extra = 0): boolean => graph.edges.some((e) => distanceToEdge(p, e) < e.width / 2 + extra);
const inBuilding = (p: Vec2): boolean =>
  hub.buildings.some((b) => b.id !== 'lot' && Math.abs(p.x - b.x) < b.width / 2 && Math.abs(p.z - b.z) < b.depth / 2);
const nearLamp = (p: Vec2, d: number): boolean => lamps.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < d);
const describe2 = (p: Vec2): string => `${p.x.toFixed(1)},${p.z.toFixed(1)}`;

describe('sitePlan: determinism', () => {
  it('returns the same plan every time', () => {
    expect(sitePlan()).toEqual(plan);
  });
});

describe('sitePlan: perimeter (SEC-1)', () => {
  it('fences the hub FENCE_MARGIN outside its roads', () => {
    expect(plan.fence.rect).toEqual(hubBounds(FENCE_MARGIN));
  });

  it('opens the fence exactly where a road extension crosses it, and nowhere else', () => {
    expect(plan.roadExtensions.length).toBeGreaterThanOrEqual(2); // entry and exit; the shuttle loop turns back inside
    const west = plan.fence.openings.filter((o) => o.side === 'west');
    expect(plan.fence.openings).toHaveLength(plan.roadExtensions.length);
    for (const ext of plan.roadExtensions) {
      const o = west.find((w: FenceOpening) => w.from <= ext.z - ext.width / 2 && w.to >= ext.z + ext.width / 2);
      expect(o, `opening for road at z=${String(ext.z)}`).toBeDefined();
      expect(o!.to - o!.from).toBeLessThanOrEqual(ext.width + 8);
    }
  });

  it('extends the public roads west through the fence to the edge of the grass', () => {
    for (const ext of plan.roadExtensions) {
      expect(ext.fromX).toBeLessThan(plan.fence.rect.minX - 20);
      expect(ext.toX).toBeGreaterThanOrEqual(roads.minX - 1);
      // Each extension continues a real hub road that starts at the west edge.
      expect(vehicleEdges.some((e) => e.path.points.some((p) => Math.abs(p.z - ext.z) < 0.5 && Math.abs(p.x - ext.toX) < 2))).toBe(true);
    }
  });
});

describe('sitePlan: patrol loop (SEC-4)', () => {
  it('is closed and stays well outside the fence', () => {
    expect(plan.patrolLoop.length).toBeGreaterThanOrEqual(8);
    const r = plan.fence.rect;
    for (const p of plan.patrolLoop) {
      const outside = p.x <= r.minX - 6 || p.x >= r.maxX + 6 || p.z <= r.minZ - 6 || p.z >= r.maxZ + 6;
      expect(outside, describe2(p)).toBe(true);
    }
    const out = hubBounds(PATROL_MARGIN + 4);
    for (const p of plan.patrolLoop) {
      expect(p.x).toBeGreaterThanOrEqual(out.minX);
      expect(p.x).toBeLessThanOrEqual(out.maxX);
    }
  });

  it('never touches a hub road (only the visual road extensions)', () => {
    for (let i = 0; i < plan.patrolLoop.length; i++) {
      const a = plan.patrolLoop[i]!;
      const b = plan.patrolLoop[(i + 1) % plan.patrolLoop.length]!;
      for (let t = 0; t <= 1; t += 0.05) {
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        expect(inCorridor(p, 2), describe2(p)).toBe(false);
      }
    }
  });
});

describe('sitePlan: wayfinding (B-3)', () => {
  it('has an entry and an exit gantry spanning their road with ≥ 5.5 m clearance', () => {
    const texts = plan.gantries.map((g) => g.text);
    expect(texts).toContain('Rental Car Return →');
    expect(texts).toContain('Airport Terminals ↑ · Exit to Airport Blvd');
    for (const g of plan.gantries) {
      expect(g.clearance).toBeGreaterThanOrEqual(GANTRY_CLEARANCE);
      const road = vehicleEdges.reduce((best, e) => (distanceToEdge(g, e) < distanceToEdge(g, best) ? e : best));
      expect(distanceToEdge(g, road), g.text).toBeLessThan(0.5);
      expect(g.span).toBeGreaterThanOrEqual(road.width + 1);
      // Legs stand outside the corridor.
      for (const side of [1, -1]) {
        const leg = { x: g.x - Math.sin(g.heading) * side * (g.span / 2), z: g.z + Math.cos(g.heading) * side * (g.span / 2) };
        expect(inCorridor(leg), `${g.text} leg ${describe2(leg)}`).toBe(false);
      }
    }
  });

  it('names the main destinations on roadside signs', () => {
    const all = plan.directionSigns.flatMap((s) => s.lines).join(' | ');
    for (const word of ['Wash', 'Service', 'EV Charging & Fuel', 'Ready Lot', 'Exit']) expect(all).toContain(word);
  });

  it('paints RETURN on the entry lanes and SLOW before crossings, on the road', () => {
    expect(plan.groundText.some((t) => t.text === 'RETURN')).toBe(true);
    expect(plan.groundText.some((t) => t.text === 'SLOW')).toBe(true);
    for (const t of plan.groundText) expect(inCorridor(t), `${t.text} at ${describe2(t)}`).toBe(true);
  });
});

describe('sitePlan: entrance (B-2, SEC-2)', () => {
  it('has a pylon and 6 flags near the entry, plus an entry and an exit booth with booms across their roads', () => {
    expect(plan.flags).toHaveLength(6);
    expect(plan.booths.map((b) => b.boom.id).sort()).toEqual(['entry', 'exit']);
    const entry = graph.edge(hub.entryEdge);
    const exit = graph.edge(hub.exitEdge);
    for (const b of plan.booths) {
      const road = b.boom.id === 'entry' ? entry : exit;
      const tip = { x: b.boom.pivot.x - Math.sin(b.boom.heading) * b.boom.length, z: b.boom.pivot.z + Math.cos(b.boom.heading) * b.boom.length };
      const tip2 = { x: b.boom.pivot.x + Math.sin(b.boom.heading) * b.boom.length, z: b.boom.pivot.z - Math.cos(b.boom.heading) * b.boom.length };
      // One end of the arm crosses the road's centre line.
      expect(Math.min(distanceToEdge(tip, road), distanceToEdge(tip2, road))).toBeLessThan(road.width);
      expect(inCorridor(b.boom.pivot), 'pivot beside the road').toBe(false);
      expect(inCorridor(b.pose), 'booth beside the road').toBe(false);
    }
    expect(Math.hypot(plan.pylon.x - entry.path.points[0]!.x, plan.pylon.z - entry.path.points[0]!.z)).toBeLessThan(60);
  });
});

describe('sitePlan: clearances (SEC-3, ENV-1)', () => {
  const placed: { what: string; p: Vec2 }[] = [
    { what: 'pylon', p: plan.pylon },
    ...plan.flags.map((p) => ({ what: 'flag', p })),
    ...plan.booths.map((b) => ({ what: 'booth', p: b.pose })),
    ...plan.directionSigns.map((p) => ({ what: 'sign', p })),
    ...plan.cctv.map((p) => ({ what: 'cctv', p })),
    ...plan.callBoxes.map((p) => ({ what: 'call box', p })),
    ...plan.bollards.map((p) => ({ what: 'bollard', p })),
    ...plan.props.map((x) => ({ what: x.kind, p: x.pose })),
  ];

  it('has CCTV, call boxes, bollards and every kind of ground prop', () => {
    expect(plan.cctv.length).toBeGreaterThanOrEqual(8);
    expect(plan.callBoxes.length).toBeGreaterThanOrEqual(3);
    expect(plan.bollards.length).toBeGreaterThanOrEqual(10);
    expect(new Set(plan.props.map((x) => x.kind))).toEqual(new Set(['barrier', 'planter', 'bench', 'shelter', 'bin']));
  });

  it('never places anything in a road corridor or a building, or on top of a lamp', () => {
    for (const { what, p } of placed) {
      expect(inCorridor(p, 0.3), `${what} in a corridor at ${describe2(p)}`).toBe(false);
      expect(inBuilding(p), `${what} in a building at ${describe2(p)}`).toBe(false);
      expect(nearLamp(p, 1.5), `${what} on a lamp at ${describe2(p)}`).toBe(false);
    }
  });

  it('keeps items apart from each other (bollards excepted, which come in rows)', () => {
    const solid = placed.filter((x) => x.what !== 'bollard');
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!;
        const b = solid[j]!;
        expect(Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z), `${a.what} ${describe2(a.p)} vs ${b.what} ${describe2(b.p)}`).toBeGreaterThanOrEqual(1.2);
      }
    }
  });

  it('keeps everything inside the fence except the road extensions and patrol loop', () => {
    const r = plan.fence.rect;
    for (const { what, p } of placed) {
      if (what === 'pylon' || what === 'flag') continue; // frontage may sit at the entrance opening
      expect(p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ, `${what} at ${describe2(p)}`).toBe(true);
    }
  });
});
