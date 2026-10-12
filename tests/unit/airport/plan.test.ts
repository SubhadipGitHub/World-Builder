import { describe, expect, it } from 'vitest';
import { GATE_IDS, GROUND, RUNWAY_LENGTH, RUNWAY_WIDTH, airportPlan, type Box } from '../../../src/airport/plan';
import { JET_LENGTH, JET_SPAN } from '../../../src/airport/flights';
import { hubBounds } from '../../../src/layout/positions';
import { FENCE_MARGIN, PATROL_MARGIN, sitePlan } from '../../../src/layout/site';
import { PLACES } from '../../../src/ui/places';
import type { Vec2 } from '../../../src/sim/types';

// Requirements §11.2–11.3, architecture §19 H1.

const plan = airportPlan();
const fence = hubBounds(FENCE_MARGIN);
const patrol = hubBounds(PATROL_MARGIN + 4);
const site = sitePlan();

const inRect = (p: Vec2, r: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
const rectOf = (b: Box) => ({ minX: b.x - b.width / 2, maxX: b.x + b.width / 2, minZ: b.z - b.depth / 2, maxZ: b.z + b.depth / 2 });
const overlaps = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>): boolean => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const corners = (b: Box): Vec2[] => {
  const r = rectOf(b);
  return [
    { x: r.minX, z: r.minZ },
    { x: r.maxX, z: r.minZ },
    { x: r.minX, z: r.maxZ },
    { x: r.maxX, z: r.maxZ },
    { x: b.x, z: b.z },
  ];
};
/** Near a hub road extension: within 6 m of its line, between its ends. */
const nearExtension = (p: Vec2): boolean => site.roadExtensions.some((e) => p.x >= e.fromX && p.x <= e.toX && Math.abs(p.z - e.z) < e.width / 2 + 6);

describe('airportPlan: determinism and extent', () => {
  it('returns the same plan every time', () => {
    expect(airportPlan()).toEqual(plan);
  });

  it('fits on the ground and has a 1.2 km × 45 m runway along the north edge', () => {
    expect(plan.runway.toX - plan.runway.fromX).toBe(RUNWAY_LENGTH);
    expect(plan.runway.width).toBe(RUNWAY_WIDTH);
    expect(plan.runway.fromX).toBeGreaterThanOrEqual(GROUND.minX);
    expect(plan.runway.toX).toBeLessThanOrEqual(GROUND.maxX);
    expect(plan.runway.z + RUNWAY_WIDTH / 2).toBeLessThanOrEqual(GROUND.maxZ);
    expect(plan.runway.z).toBeGreaterThan(plan.taxiway.z);
    expect(plan.taxiway.z).toBeGreaterThan(plan.apronLane.z);
    expect(plan.bounds.minX).toBeGreaterThanOrEqual(GROUND.minX);
    expect(plan.bounds.minZ).toBeGreaterThanOrEqual(GROUND.minZ);
    expect(plan.bounds.maxX).toBeLessThanOrEqual(GROUND.maxX);
    expect(plan.bounds.maxZ).toBeLessThanOrEqual(GROUND.maxZ);
  });
});

describe('airportPlan: keeps clear of the hub (§11.2)', () => {
  const boxes: Box[] = [plan.terminal, ...plan.buildings];

  it('puts no building inside the hub fence, on the patrol loop or by a road extension', () => {
    for (const b of boxes) {
      expect(overlaps(rectOf(b), patrol), `${b.id} vs hub and patrol loop`).toBe(false);
      for (const c of corners(b)) expect(nearExtension(c), `${b.id} by a road extension`).toBe(false);
    }
  });

  it('keeps the apron, taxiway, runway and lights north of the airside fence and clear of the hub', () => {
    expect(plan.airsideFence.z).toBeGreaterThan(patrol.maxZ);
    expect(plan.terminal.z - plan.terminal.depth / 2).toBeGreaterThan(plan.airsideFence.z);
    expect(plan.apron.minZ).toBeGreaterThan(plan.airsideFence.z);
    for (const l of plan.airfieldLights) expect(l.z, `light at ${String(l.x)},${String(l.z)}`).toBeGreaterThan(plan.airsideFence.z);
  });

  it('crosses the hub road extensions only on overpasses with ≥ 5.5 m clearance', () => {
    expect(plan.boulevard.x).toBeLessThan(fence.minX);
    expect(plan.overpasses.map((o) => o.z).sort((a, b) => a - b)).toEqual(site.roadExtensions.map((e) => e.z).sort((a, b) => a - b));
    for (const o of plan.overpasses) expect(o.clearance).toBeGreaterThanOrEqual(5.5);
    expect(plan.boulevard.deckY - 1).toBeGreaterThanOrEqual(5.5);
  });
});

describe('airportPlan: buildings and gates (A-1…A-4)', () => {
  it('has every landside and airside building, none overlapping another or the terminal', () => {
    expect(plan.buildings.map((b) => b.id).sort()).toEqual(['cargo', 'cellLot', 'fire', 'fuel', 'garage', 'hotel', 'tower']);
    const boxes: Box[] = [plan.terminal, ...plan.buildings];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(rectOf(boxes[i]!), rectOf(boxes[j]!)), `${boxes[i]!.id} vs ${boxes[j]!.id}`).toBe(false);
    }
    expect(plan.buildings.find((b) => b.id === 'tower')!.height).toBeGreaterThanOrEqual(55);
  });

  it('has 8 gate stands on the apron, ≥ 45 m apart, nose-in and clear of the terminal', () => {
    expect(plan.gates.map((g) => g.id)).toEqual(GATE_IDS);
    const t = rectOf(plan.terminal);
    for (const g of plan.gates) {
      expect(inRect(g.stand, plan.apron), g.id).toBe(true);
      // Nose points at the terminal (south), and the nose stays clear of the facade.
      expect(Math.sin(g.stand.heading)).toBeLessThan(-0.9);
      expect(g.stand.z - JET_LENGTH / 2).toBeGreaterThan(t.maxZ + 4);
      expect(Math.abs(g.bridgeRoot.z - t.maxZ)).toBeLessThan(1);
    }
    for (let i = 1; i < plan.gates.length; i++) {
      const a = plan.gates[i - 1]!.stand;
      const b = plan.gates[i]!.stand;
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(Math.max(45, JET_SPAN + 6));
    }
    expect(plan.apronLane.z - Math.max(...plan.gates.map((g) => g.stand.z))).toBeGreaterThanOrEqual(45);
  });

  it('keeps the remote stand on the apron near cargo, away from every gate', () => {
    for (const g of plan.gates) expect(Math.hypot(g.stand.x - plan.remoteStand.x, g.stand.z - plan.remoteStand.z)).toBeGreaterThanOrEqual(60);
    const cargo = plan.buildings.find((b) => b.id === 'cargo')!;
    expect(Math.hypot(cargo.x - plan.remoteStand.x, cargo.z - plan.remoteStand.z)).toBeLessThan(150);
  });
});

describe('airportPlan: lights, signs and labels (A-5, A-6, L-1)', () => {
  it('lines both runway edges, the thresholds and the taxiway with lights', () => {
    const r = plan.runway;
    const white = plan.airfieldLights.filter((l) => l.colour === 'white');
    for (const side of [1, -1]) expect(white.filter((l) => Math.abs(l.z - (r.z + (side * r.width) / 2)) < 2).length).toBeGreaterThanOrEqual(15);
    expect(plan.airfieldLights.some((l) => l.colour === 'green')).toBe(true);
    expect(plan.airfieldLights.some((l) => l.colour === 'red')).toBe(true);
    expect(plan.airfieldLights.filter((l) => l.colour === 'blue').length).toBeGreaterThanOrEqual(20);
  });

  it('has apron floodlight masts and the boulevard gantries', () => {
    expect(plan.masts.length).toBeGreaterThanOrEqual(6);
    for (const m of plan.masts) expect(inRect(m, plan.apron) || m.z > plan.airsideFence.z).toBe(true);
    const texts = plan.gantries.map((g) => g.text);
    expect(texts).toContain('Terminal A · Departures / Arrivals');
    expect(texts).toContain('Rental Car Return → GoldLane');
    expect(texts).toContain('Parking · Hotel · Cell Phone Lot');
  });

  it('anchors every place label', () => {
    expect(plan.labels.map((l) => l.id).sort()).toEqual(PLACES.map((p) => p.id).sort());
    for (const l of plan.labels) expect(inRect(l, GROUND), l.id).toBe(true);
  });
});
