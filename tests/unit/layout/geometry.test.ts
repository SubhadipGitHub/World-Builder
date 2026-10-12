import { describe, expect, it } from 'vitest';
import { clearOfRoads, distanceToEdge, insideBuilding } from '../../../src/layout/geometry';
import { hub, hubGraph } from '../../../src/layout/hub';

describe('layout/geometry (architecture §18, G1)', () => {
  const graph = hubGraph();
  const entry = graph.edge(hub.entryEdge);

  it('measures the distance to an edge centre line', () => {
    const mid = entry.path.pointAt(entry.length / 2);
    expect(distanceToEdge(mid, entry)).toBeCloseTo(0, 6);
    expect(distanceToEdge({ x: mid.x, z: mid.z + 7 }, entry)).toBeCloseTo(7, 1);
  });

  it('knows when a point is clear of every road corridor', () => {
    const mid = entry.path.pointAt(entry.length / 2);
    expect(clearOfRoads(mid, 0)).toBe(false);
    expect(clearOfRoads({ x: mid.x, z: mid.z + entry.width / 2 + 0.5 }, 1)).toBe(false);
    expect(clearOfRoads({ x: 0, z: 400 }, 1)).toBe(true);
  });

  it('knows building footprints, but not the Ready lot surface', () => {
    const wash = hub.buildings.find((b) => b.id === 'wash')!;
    const lot = hub.buildings.find((b) => b.id === 'lot')!;
    expect(insideBuilding({ x: wash.x, z: wash.z }, 0)).toBe(true);
    expect(insideBuilding({ x: wash.x + wash.width / 2 + 1, z: wash.z }, 0)).toBe(false);
    expect(insideBuilding({ x: wash.x + wash.width / 2 + 1, z: wash.z }, 2)).toBe(true);
    expect(insideBuilding({ x: lot.x, z: lot.z }, 0)).toBe(false);
  });
});
