import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { lampPlacements, type LampPlacement } from '../layout/lamps';
import { assemble, paint, place } from './kit/assemble';
import { cylinder, roundedBox } from './kit/shapes';
import { LAMPS_ON_AT, lampLevel } from './lampLevel';

export interface LampsView {
  readonly group: Group;
  /** Advances the lamps; returns the mean brightness (0 off … 1 all lit). */
  update(frame: { readonly night: number; readonly wallTime: number; readonly reducedMotion: boolean; readonly poolFraction: number }): number;
}

const ARM = 1.8;
const UP = new Vector3(0, 1, 0);
const OFF = new Color('#3A3B40');
const ON = new Color('#FFD9A0').multiplyScalar(2.4);

/** Pole, curved arm and lamp housing in brushed grey, reaching along +x. */
function poleGeometry(): BufferGeometry {
  return assemble([
    place(paint(cylinder(0.32, 0.4, 0.5, 10), '#5B5F6B'), { y: 0.25 }),
    place(paint(cylinder(0.11, 0.15, 7.2, 8), '#6C717D'), { y: 3.85 }),
    place(paint(roundedBox(ARM + 0.3, 0.12, 0.14, 0.05, 1), '#6C717D'), { x: ARM / 2, y: 7.45, rotZ: -0.06 }),
    place(paint(roundedBox(0.9, 0.22, 0.45, 0.1, 1), '#4A4E58'), { x: ARM, y: 7.35 }),
  ]);
}

/** The glowing lens under the housing. */
const headGeometry = (): BufferGeometry => place(roundedBox(0.7, 0.08, 0.34, 0.04, 1), { x: ARM, y: 7.22 });

/** Radial pool of light on the ground: bright centre, no light at the rim (vertex colours). */
function poolGeometry(radius: number): BufferGeometry {
  const g = new CircleGeometry(radius, 28).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const colours: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, 1 - Math.hypot(pos.getX(i), pos.getZ(i)) / radius);
    colours.push(k * k, k * k, k * k);
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return g;
}

const SIZE: Readonly<Record<LampPlacement['kind'], number>> = { street: 1, walkway: 0.75, flood: 1.35 };
const POOL_RADIUS: Readonly<Record<LampPlacement['kind'], number>> = { street: 6.5, walkway: 4, flood: 8.5 };
/** Peak pool brightness: enough to read as a pool of light without washing out the ground. */
const POOL_PEAK = 0.32;

/** Roadside lighting (V-6): poles, lenses and light pools for every placement, switched with a stagger. */
export function createLampsView(): LampsView {
  const lamps = lampPlacements();
  const group = new Group();
  const poleMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
  const headMat = new MeshBasicMaterial({ toneMapped: false });
  const poolMat = new MeshBasicMaterial({ color: '#FFD58A', vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const poles = new InstancedMesh(poleGeometry(), poleMat, lamps.length);
  const heads = new InstancedMesh(headGeometry(), headMat, lamps.length);
  const pools = new InstancedMesh(poolGeometry(1), poolMat, lamps.length);
  pools.renderOrder = 1;
  const m = new Matrix4();
  const q = new Quaternion();
  lamps.forEach((l, i) => {
    const s = SIZE[l.kind];
    m.compose(new Vector3(l.x, 0, l.z), q.setFromAxisAngle(UP, -l.heading), new Vector3(s, s, s));
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    const r = POOL_RADIUS[l.kind];
    const reach = ARM * s;
    m.compose(new Vector3(l.x + Math.cos(l.heading) * reach, 0.1, l.z + Math.sin(l.heading) * reach), q.identity(), new Vector3(r, 1, r));
    pools.setMatrixAt(i, m);
    heads.setColorAt(i, OFF);
    pools.setColorAt(i, new Color(0, 0, 0));
  });
  poles.castShadow = true;
  group.add(poles, heads, pools);

  let lit = false;
  let switchedAt = -Infinity;
  let lastFraction = -1;
  const level = new Float32Array(lamps.length);
  const colour = new Color();

  return {
    group,
    update({ night, wallTime, reducedMotion, poolFraction }) {
      const want = night >= LAMPS_ON_AT;
      if (want !== lit) {
        lit = want;
        switchedAt = wallTime;
      }
      if (poolFraction !== lastFraction) {
        // Quality tier changed the share of pools: redraw every lamp once.
        lastFraction = poolFraction;
        level.fill(-1);
      }
      const since = wallTime - switchedAt;
      let sum = 0;
      let changed = false;
      for (let i = 0; i < lamps.length; i++) {
        const v = lampLevel(lit, since, i, reducedMotion);
        sum += v;
        if (v !== level[i]) {
          level[i] = v;
          changed = true;
          heads.setColorAt(i, colour.copy(OFF).lerp(ON, v));
          const showPool = poolFraction >= 1 || i % Math.round(1 / Math.max(poolFraction, 0.01)) === 0;
          pools.setColorAt(i, colour.setScalar(showPool ? v * POOL_PEAK : 0));
        }
      }
      if (changed) {
        if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
        if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
      }
      pools.visible = sum > 0;
      return lamps.length === 0 ? 0 : sum / lamps.length;
    },
  };
}
