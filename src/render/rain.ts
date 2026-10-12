import { BoxGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import type { Vec2 } from '../sim/types';

export interface RainField {
  readonly mesh: InstancedMesh;
  /** Animates falling streaks around the camera target while it rains (X-1). */
  update(raining: boolean, dt: number, around: Vec2, intensity: number): void;
}

const COUNT = 1600;
const SPAN_XZ = 180;
const TOP = 70;
const FALL_SPEED = 32;

/** One instanced draw call of thin streaks; positions wrap within a box that follows the camera target. */
export function createRain(): RainField {
  const material = new MeshBasicMaterial({ color: '#B9CCE6', transparent: true, opacity: 0.5, depthWrite: false });
  const mesh = new InstancedMesh(new BoxGeometry(0.05, 1.3, 0.05), material, COUNT);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  // Offsets are relative to the field origin; random scatter is fine outside the deterministic sim.
  const xs = Float32Array.from({ length: COUNT }, () => (Math.random() - 0.5) * SPAN_XZ);
  const zs = Float32Array.from({ length: COUNT }, () => (Math.random() - 0.5) * SPAN_XZ);
  const ys = Float32Array.from({ length: COUNT }, () => Math.random() * TOP);
  const m = new Matrix4();
  // Slight wind slant.
  m.makeRotationZ(0.12);

  return {
    mesh,
    update(raining, dt, around, intensity) {
      mesh.visible = raining;
      if (!raining) return;
      material.opacity = 0.35 + 0.25 * intensity;
      for (let i = 0; i < COUNT; i++) {
        let y = (ys[i] as number) - FALL_SPEED * dt;
        if (y < 0) y += TOP;
        ys[i] = y;
        m.setPosition(around.x + (xs[i] as number) + y * 0.12, y, around.z + (zs[i] as number));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
