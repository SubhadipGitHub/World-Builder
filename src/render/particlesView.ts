import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type Object3D } from 'three';
import type { PhaseChange } from '../airport/phases';
import type { Vec2 } from '../sim/types';
import type { Environment } from './environment';
import { createParticlePool, exhaustEmitters, particleCap, type EmitterAgent, type ParticleKind, type ParticlePool, type ParticleSeed } from './particles';

// Ambient particles, the Three.js side (M9, FE-14, FE-15, architecture F14): one pool, two instanced billboard meshes
// (soft alpha for smoke, dust and leaves; additive for spray, steam and splashes). Randomness here is visual only.

export interface ParticleFrame {
  readonly dt: number;
  readonly env: Environment;
  readonly tier: number;
  readonly reducedMotion: boolean;
  readonly around: Vec2;
  readonly cameraQuaternion: Quaternion;
  /** Moving agents at their interpolated positions. */
  readonly agents: readonly EmitterAgent[];
  /** Wash bays in use (FE-14 spray and steam). */
  readonly washBays: readonly Vec2[];
  /** Aircraft now, and phase changes this frame. */
  readonly aircraft: readonly { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly heading: number; readonly phase: string }[];
  readonly phases: readonly PhaseChange[];
}

export interface ParticlesView {
  readonly group: readonly InstancedMesh[];
  update(frame: ParticleFrame): void;
  live(): number;
}

const ADDITIVE: ReadonlySet<ParticleKind> = new Set(['spray', 'steam', 'splash']);
const COLOUR: Readonly<Record<ParticleKind, string>> = {
  exhaust: '#9A9EA6',
  spray: '#6F8FB0',
  steam: '#8090A0',
  splash: '#7088A8',
  jetExhaust: '#B4B0A8',
  tyreSmoke: '#D8D8DC',
  leaf: '#6E8B3D',
  dust: '#C7A574',
};
/** Size grows over a particle's life by this factor (smoke spreads, splashes widen). */
const GROWTH: Readonly<Record<ParticleKind, number>> = { exhaust: 2.5, spray: 1.6, steam: 2.2, splash: 3, jetExhaust: 3, tyreSmoke: 3, leaf: 1, dust: 2 };

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export function createParticlesView(parent: Object3D): ParticlesView {
  const geometry = new PlaneGeometry(1, 1);
  const soft = new MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
  const glow = new MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending });
  const MAX = particleCap(0, false);
  const pooled = (mat: MeshBasicMaterial): InstancedMesh => {
    const mesh = new InstancedMesh(geometry, mat, MAX);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    parent.add(mesh);
    return mesh;
  };
  const meshes: readonly [InstancedMesh, InstancedMesh] = [pooled(soft), pooled(glow)];

  let cap = MAX;
  let pool: ParticlePool = createParticlePool(cap);
  const carry = new Map<string, number>();
  const m = new Matrix4();
  const p = new Vector3();
  const s = new Vector3();
  const c = new Color();

  /** Emits `rate` per second on average for `key`, carrying fractions between frames. */
  const emitAt = (key: string, rate: number, dt: number, make: () => ParticleSeed): void => {
    let n = (carry.get(key) ?? 0) + rate * dt;
    while (n >= 1) {
      pool.emit(make());
      n--;
    }
    carry.set(key, n);
  };

  return {
    group: meshes,
    update(f) {
      const want = particleCap(f.tier, f.reducedMotion);
      if (want !== cap) {
        cap = want;
        pool = createParticlePool(cap);
        carry.clear();
      }
      if (cap === 0) {
        for (const mesh of meshes) mesh.count = 0;
        return;
      }
      const { dt, env } = f;
      const wind = env.wind;
      const wx = Math.cos(wind.dirRad) * wind.strength * 3;
      const wz = Math.sin(wind.dirRad) * wind.strength * 3;
      const scale = cap / MAX;

      // Exhaust from petrol vehicles pulling away (EVs never, FE-14).
      for (const a of exhaustEmitters(f.agents)) {
        emitAt(`ex:${a.id}`, 3 * scale, dt, () => ({
          kind: 'exhaust',
          x: a.x - Math.cos(a.heading) * 2.4,
          y: 0.35,
          z: a.z - Math.sin(a.heading) * 2.4,
          vx: wx * 0.3 + rand(-0.2, 0.2),
          vy: rand(0.3, 0.6),
          vz: wz * 0.3 + rand(-0.2, 0.2),
          life: rand(1, 1.8),
          size: 0.35,
        }));
      }
      // Wash spray inside the tunnel and steam drifting out of it.
      f.washBays.forEach((b, i) => {
        emitAt(`spray:${String(i)}`, 18 * scale, dt, () => ({ kind: 'spray', x: b.x + rand(-2, 2), y: rand(0.5, 2.5), z: b.z + rand(-1.2, 1.2), vx: rand(-1, 1), vy: rand(-0.5, 1), vz: rand(-1, 1), life: rand(0.4, 0.8), size: 0.5 }));
        emitAt(`steam:${String(i)}`, 4 * scale, dt, () => ({ kind: 'steam', x: b.x + rand(-2, 2), y: 3, z: b.z, vx: wx * 0.4, vy: rand(0.6, 1.2), vz: wz * 0.4, life: rand(2, 3.5), size: 1.2 }));
      });
      // Splash rings on the wet ground around the camera target (rain and thunderstorm).
      if (env.rain) {
        emitAt('splash', (env.storm ? 90 : 60) * scale, dt, () => ({ kind: 'splash', x: f.around.x + rand(-70, 70), y: 0.06, z: f.around.z + rand(-70, 70), vx: 0, vy: 0, vz: 0, life: 0.35, size: 0.25 }));
      }
      // Jet exhaust on the take-off roll; a puff of tyre smoke at touchdown.
      for (const a of f.aircraft) {
        if (a.phase !== 'takeoff' || a.y > 20) continue;
        emitAt(`jet:${a.id}`, 30 * scale, dt, () => ({
          kind: 'jetExhaust',
          x: a.x - Math.cos(a.heading) * 14 + rand(-3, 3),
          y: 2 + rand(0, 1),
          z: a.z - Math.sin(a.heading) * 14 + rand(-3, 3),
          vx: -Math.cos(a.heading) * 6,
          vy: rand(0.5, 1.5),
          vz: -Math.sin(a.heading) * 6,
          life: rand(1.5, 2.5),
          size: 3,
        }));
      }
      for (const ch of f.phases) {
        if (ch.to !== 'landing') continue;
        for (let k = 0; k < 14 * scale; k++) pool.emit({ kind: 'tyreSmoke', x: ch.x + rand(-4, 4), y: 1, z: ch.z + rand(-4, 4), vx: rand(-2, 2), vy: rand(0.5, 2), vz: rand(-2, 2), life: rand(1.5, 2.5), size: 2.5 });
      }
      // Leaves in a strong wind, dust in a heatwave.
      if (wind.strength > 0.5) {
        emitAt('leaf', 12 * wind.strength * scale, dt, () => ({ kind: 'leaf', x: f.around.x + rand(-60, 60), y: rand(1, 6), z: f.around.z + rand(-60, 60), vx: wx * 2, vy: rand(-0.6, 0.2), vz: wz * 2, life: rand(3, 5), size: 0.25 }));
      }
      if (env.heat) {
        emitAt('dust', 10 * scale, dt, () => ({ kind: 'dust', x: f.around.x + rand(-60, 60), y: 0.4, z: f.around.z + rand(-60, 60), vx: wx + 1, vy: rand(0.1, 0.4), vz: wz, life: rand(2, 4), size: 1.4 }));
      }

      pool.step(dt);
      const counts = [0, 0];
      pool.forEach((q) => {
        const which = ADDITIVE.has(q.kind) ? 1 : 0;
        const mesh = which === 1 ? meshes[1] : meshes[0];
        const i = counts[which] ?? 0;
        const t = q.age / q.life;
        const size = q.size * (1 + (GROWTH[q.kind] - 1) * t) * (1 - 0.3 * t);
        p.set(q.x, q.y, q.z);
        if (q.kind === 'splash') {
          // Rings lie on the ground; everything else faces the camera.
          m.compose(p, FLAT, s.set(size, size, size));
        } else {
          m.compose(p, f.cameraQuaternion, s.set(size, size, size));
        }
        mesh.setMatrixAt(i, m);
        // Fade out by darkening (additive) or blending towards transparent-looking grey (soft).
        c.set(COLOUR[q.kind]).multiplyScalar(1 - t * 0.85);
        mesh.setColorAt(i, c);
        counts[which] = i + 1;
      });
      meshes.forEach((mesh, k) => {
        mesh.count = counts[k] ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    },
    live: () => pool.live(),
  };
}

const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
