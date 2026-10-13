import { Group, Mesh, MeshStandardMaterial } from 'three';
import { assemble, paint, place } from './kit/assemble';
import { cylinder } from './kit/shapes';
import type { Wind } from './wind';

// Windsock beside the runway (M9, FE-13): it points downwind and fills out as the wind rises. Two draw calls.

export interface Windsock {
  readonly group: Group;
  update(wind: Wind, enabled: boolean): void;
}

/** Between the parallel taxiway (z ≈ 430) and the runway edge (z ≈ 459), near the east threshold. */
const AT = { x: 520, z: 447 };
const POLE_H = 7;

export function createWindsock(): Windsock {
  const group = new Group();
  group.position.set(AT.x, 0, AT.z);
  const pole = new Mesh(place(paint(cylinder(0.12, 0.16, POLE_H, 8), '#C9CDD4'), { y: POLE_H / 2 }), new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  // Orange-and-white banded cone along +x, hinged at the pole top.
  const bands = [0, 1, 2, 3, 4].map((i) => place(paint(cylinder(0.55 - i * 0.07, 0.48 - i * 0.07, 0.7, 10), i % 2 ? '#F4F4F2' : '#F07A1A'), { rotZ: Math.PI / 2, x: 0.4 + i * 0.7 }));
  const sock = new Mesh(assemble(bands), new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  const hinge = new Group();
  hinge.position.y = POLE_H - 0.4;
  hinge.add(sock);
  group.add(pole, hinge);
  return {
    group,
    update(wind, enabled) {
      // three's y rotation turns +x towards −z, so negate the ground-plane angle.
      hinge.rotation.y = -wind.dirRad;
      const fill = enabled ? Math.min(1, wind.strength * (0.7 + 0.3 * wind.gust)) : wind.strength;
      // Limp (hanging) in calm air, straight out in a gale.
      hinge.rotation.z = -(1 - fill) * 1.25;
    },
  };
}
