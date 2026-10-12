import { Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { Palette } from './palette';

export interface SelectionRing {
  readonly mesh: Mesh;
  /** Shows the ring at (x, z) sized for an object of the given radius, pulsing over time (I-3). */
  show(x: number, z: number, radius: number, timeSec: number): void;
  hide(): void;
}

export function createSelectionRing(palette: Palette): SelectionRing {
  const material = new MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.85, depthWrite: false });
  const mesh = new Mesh(new RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), material);
  mesh.renderOrder = 2;
  mesh.visible = false;
  return {
    mesh,
    show(x, z, radius, t) {
      const pulse = 1 + 0.1 * Math.sin(t * 4);
      mesh.position.set(x, 0.08, z);
      mesh.scale.setScalar(radius * pulse);
      material.opacity = 0.65 + 0.25 * Math.sin(t * 4);
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
    },
  };
}
