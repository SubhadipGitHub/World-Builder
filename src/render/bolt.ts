import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial } from 'three';
import { createRng } from '../sim/rng';
import type { Vec2 } from '../sim/types';
import type { Strike } from './lightning';

// A distant lightning bolt (M9, FE-12): a jagged line from the cloud base to the ground, shaped by the strike's seed.
// One draw call; hidden except during a strike's first 250 ms, never with reduced motion or on tier 2 (F12, FE-15).

export interface BoltView {
  readonly line: Line;
  update(strike: Strike | null, visible: boolean, around: Vec2): void;
}

const SEGMENTS = 14;
const CLOUD_BASE = 260;

export function createBolt(): BoltView {
  const material = new LineBasicMaterial({ color: '#EEF4FF', transparent: true, opacity: 0.95 });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
  const line = new Line(geometry, material);
  line.frustumCulled = false;
  line.visible = false;
  let shapedFor = -1;
  return {
    line,
    update(strike, visible, around) {
      line.visible = visible && strike !== null;
      if (!strike || !line.visible || strike.seed === shapedFor) return;
      shapedFor = strike.seed;
      const rng = createRng(strike.seed);
      const gx = around.x + Math.cos(strike.azimuthRad) * strike.distanceM;
      const gz = around.z + Math.sin(strike.azimuthRad) * strike.distanceM;
      const pos = geometry.getAttribute('position') as Float32BufferAttribute;
      let x = gx + rng.range(-40, 40);
      let z = gz + rng.range(-40, 40);
      for (let i = 0; i <= SEGMENTS; i++) {
        const y = CLOUD_BASE * (1 - i / SEGMENTS);
        pos.setXYZ(i, x, y, z);
        // Jagged steps that wander towards the ground point.
        x += (gx - x) / (SEGMENTS - i + 1) + rng.range(-12, 12);
        z += (gz - z) / (SEGMENTS - i + 1) + rng.range(-12, 12);
      }
      pos.needsUpdate = true;
    },
  };
}
