import { BoxGeometry, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import type { Vec2 } from '../sim/types';
import type { Wind } from './wind';

export interface RainField {
  readonly mesh: InstancedMesh;
  /** Animates falling streaks around the camera target while it rains (X-1); slanted by the wind (FE-13); heavier in a storm. */
  update(raining: boolean, dt: number, around: Vec2, intensity: number, wind?: Wind): void;
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
  const tilt = new Euler();

  return {
    mesh,
    update(raining, dt, around, intensity, wind) {
      mesh.visible = raining;
      if (!raining) return;
      material.opacity = Math.min(0.75, 0.35 + 0.25 * intensity);
      // M9: the streaks lean downwind (0.12 rad in still air, as before; up to ~0.6 in a gale).
      const slant = 0.12 + 0.5 * (wind ? wind.strength * (0.7 + 0.3 * wind.gust) : 0);
      const dx = Math.cos(wind?.dirRad ?? 0);
      const dz = Math.sin(wind?.dirRad ?? 0);
      m.makeRotationFromEuler(tilt.set(slant * dz, 0, -slant * dx));
      const fall = FALL_SPEED * (intensity > 1 ? 1.25 : 1);
      for (let i = 0; i < COUNT; i++) {
        let y = (ys[i] as number) - fall * dt;
        if (y < 0) y += TOP;
        ys[i] = y;
        m.setPosition(around.x + (xs[i] as number) + y * slant * dx, y, around.z + (zs[i] as number) + y * slant * dz);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
