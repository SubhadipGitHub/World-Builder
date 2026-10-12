import { describe, expect, it } from 'vitest';
import { hub } from '../../../../src/layout/hub';
import { unitPose } from '../../../../src/layout/positions';
import { buildingAsset } from '../../../../src/render/assets/buildings';
import { triangleCount } from '../../../../src/render/kit/assemble';
import { darkPalette } from '../../../../src/render/palette';
import { extent, positions } from '../kit/helpers';

const buildings = hub.buildings.filter((b) => b.id !== 'lot');

/** True if any triangle entirely above `y` covers the ground point (x, z) when seen from above. */
function coveredFromAbove(pts: [number, number, number][], x: number, z: number, y: number): boolean {
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const [a, b, c] = [pts[i]!, pts[i + 1]!, pts[i + 2]!];
    if (a[1] <= y || b[1] <= y || c[1] <= y) continue;
    const d1 = (x - b[0]) * (a[2] - b[2]) - (a[0] - b[0]) * (z - b[2]);
    const d2 = (x - c[0]) * (b[2] - c[2]) - (b[0] - c[0]) * (z - c[2]);
    const d3 = (x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

describe('buildingAsset (V-3)', () => {
  for (const b of buildings) {
    it(`${b.id} stays within its footprint and height, within the triangle budget`, () => {
      const a = buildingAsset(b, darkPalette);
      const e = extent(a.solid, a.glass, a.glow);
      if (b.id === 'gates') {
        expect(Math.hypot(e.center.x - b.x, e.center.z - b.z)).toBeLessThan(12);
      } else {
        expect(e.min.x).toBeGreaterThanOrEqual(b.x - b.width / 2 - 0.6);
        expect(e.max.x).toBeLessThanOrEqual(b.x + b.width / 2 + 0.6);
        expect(e.min.z).toBeGreaterThanOrEqual(b.z - b.depth / 2 - 0.6);
        expect(e.max.z).toBeLessThanOrEqual(b.z + b.depth / 2 + 0.6);
      }
      expect(e.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(e.max.y).toBeLessThanOrEqual(b.height + 4);
      expect(triangleCount(a.solid) + triangleCount(a.glass) + triangleCount(a.glow)).toBeLessThanOrEqual(25_000);
    });
  }

  it('gives the terminal signage and window strips that glow at night', () => {
    const terminal = hub.buildings.find((b) => b.id === 'terminal')!;
    expect(buildingAsset(terminal, darkPalette).glow.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('keeps every bay visible from above: no solid roof over a parked car', () => {
    const covers: Record<string, readonly string[]> = {
      canopy: hub.stations.returnLane.units.map((u) => u.id),
      wash: hub.stations.wash.units.map((u) => u.id),
      service: hub.stations.service.units.map((u) => u.id),
      evHub: hub.stations.charger.units.map((u) => u.id),
      fuel: hub.stations.pump.units.map((u) => u.id),
    };
    for (const [id, units] of Object.entries(covers)) {
      const b = hub.buildings.find((x) => x.id === id)!;
      const solid = positions(buildingAsset(b, darkPalette).solid);
      for (const unit of units) {
        const p = unitPose(unit);
        expect(coveredFromAbove(solid, p.x, p.z, 2.2), `${id} covers ${unit}`).toBe(false);
      }
    }
  });
});
