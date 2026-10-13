import { AdditiveBlending, CircleGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3, type Quaternion } from 'three';
import type { LampPlacement } from '../layout/lamps';

// Fog halos (M9, FE-11): a soft glow around every lamp head while the lamps are lit in fog or mist. One draw call.

export interface Halos {
  readonly mesh: InstancedMesh;
  /** `level`: lamp brightness 0–1; `haze`: fog or mist amount 0–1. Faces the camera. */
  update(level: number, haze: number, cameraQuaternion: Quaternion): void;
}

/** Lamp head reach and height per kind, matching lampsView (arm 1.8 m at 7.22 m, scaled by size). */
const SIZE: Readonly<Record<LampPlacement['kind'], number>> = { street: 1, walkway: 0.75, flood: 1.35, mast: 2.2 };
const ARM = 1.8;
const HEAD_Y = 7.22;
const RADIUS = 2.4;
const WARM = new Color('#FFD9A0');

/** Radial glow: bright centre, black rim (invisible with additive blending). */
function glowDisc(): CircleGeometry {
  const g = new CircleGeometry(1, 24);
  const pos = g.getAttribute('position');
  const colours: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, 1 - Math.hypot(pos.getX(i), pos.getY(i)));
    colours.push(k * k, k * k, k * k);
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return g;
}

export function createHalos(placements: readonly LampPlacement[]): Halos {
  const material = new MeshBasicMaterial({ vertexColors: true, color: WARM, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const mesh = new InstancedMesh(glowDisc(), material, Math.max(1, placements.length));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const heads = placements.map((l) => {
    const k = SIZE[l.kind];
    return new Vector3(l.x + Math.cos(l.heading) * ARM * k, HEAD_Y * k - 0.2, l.z + Math.sin(l.heading) * ARM * k);
  });
  const m = new Matrix4();
  const s = new Vector3();
  return {
    mesh,
    update(level, haze, q) {
      const strength = level * haze;
      mesh.visible = strength > 0.02;
      if (!mesh.visible) return;
      material.opacity = Math.min(0.85, strength);
      heads.forEach((h, i) => {
        const k = SIZE[placements[i]?.kind ?? 'street'];
        mesh.setMatrixAt(i, m.compose(h, q, s.setScalar(RADIUS * k)));
      });
      mesh.count = heads.length;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
