import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Raycaster,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dimensions } from '../config/facility';
import type { AgentView } from '../sim/world';
import type { PoseSample } from './interp';
import type { Palette } from './palette';
import { createInstanceRegistry, type InstanceRegistry } from './registry';

export interface AgentLayer {
  readonly group: Group;
  /** Places every agent at its interpolated pose; agents that left are hidden. */
  update(agents: readonly AgentView[], poses: ReadonlyMap<string, PoseSample>): void;
  /** Agent id under the ray, or null. */
  pick(raycaster: Raycaster): string | null;
  /** Last rendered pose of an agent. */
  poseOf(id: string): PoseSample | undefined;
}

type VisualKey = 'sedan' | 'suv' | 'ev' | 'shuttle' | 'cart' | 'tow' | 'van' | 'pedestrian';

interface Part {
  readonly geometry: BufferGeometry;
  readonly color: string | null;
  /** Instance colours come from the agent id. */
  readonly tinted?: boolean;
  readonly pickable?: boolean;
}

interface Visual {
  readonly registry: InstanceRegistry;
  readonly meshes: InstancedMesh[];
  readonly tintedIndex: number | null;
  readonly pickIndex: number;
}

const CAPACITY: Readonly<Record<VisualKey, number>> = { sedan: 80, suv: 60, ev: 70, shuttle: 4, cart: 6, tow: 2, van: 2, pedestrian: 60 };

/** Geometry is built in each kind's real size, length along +x (the heading), centred on the footprint. */
const boxAt = (l: number, h: number, w: number, x: number, y: number): BufferGeometry => new BoxGeometry(l, h, w).translate(x, y, 0);

function carParts(cls: 'sedan' | 'suv' | 'ev', palette: Palette): Part[] {
  const { length: l, width: w } = dimensions[cls];
  const bodyH = cls === 'suv' ? 0.8 : cls === 'ev' ? 0.62 : 0.56;
  const cabinL = cls === 'suv' ? l * 0.62 : l * 0.52;
  const cabinH = cls === 'suv' ? 0.62 : 0.5;
  const bodyTop = 0.32 + bodyH;
  return [
    { geometry: boxAt(l * 0.9, 0.36, w * 1.02, 0, 0.3), color: palette.chassis },
    { geometry: boxAt(l, bodyH, w, 0, 0.32 + bodyH / 2), color: '#FFFFFF', tinted: true, pickable: true },
    { geometry: boxAt(cabinL, cabinH, w * 0.86, cls === 'suv' ? -l * 0.06 : -l * 0.08, bodyTop + cabinH / 2), color: palette.glass },
  ];
}

function visuals(palette: Palette): Record<VisualKey, Part[]> {
  const s = dimensions.shuttle;
  const t = dimensions.tow;
  const v = dimensions.van;
  const c = dimensions.cart;
  return {
    sedan: carParts('sedan', palette),
    suv: carParts('suv', palette),
    ev: carParts('ev', palette),
    shuttle: [
      { geometry: boxAt(s.length, 2.3, s.width, 0, 0.45 + 1.15), color: palette.accent, pickable: true },
      { geometry: boxAt(s.length * 0.92, 0.7, s.width + 0.04, 0.1, 2.0), color: palette.glass },
    ],
    cart: [
      { geometry: boxAt(c.length, 0.7, c.width, 0, 0.55), color: '#F2F2F0', pickable: true },
      { geometry: boxAt(c.length * 0.7, 0.08, c.width + 0.05, -0.1, 1.95), color: palette.accent },
    ],
    tow: [
      {
        geometry: mergeGeometries([boxAt(2.2, 2.0, t.width, t.length / 2 - 1.1, 1.4), boxAt(t.length - 2.2, 0.55, t.width, -1.1, 0.75)]),
        color: palette.tow,
        pickable: true,
      },
    ],
    van: [
      { geometry: boxAt(v.length, 2.1, v.width, 0, 1.45), color: '#F2F2F0', pickable: true },
      { geometry: boxAt(0.9, 0.8, v.width + 0.04, v.length / 2 - 0.6, 1.9), color: palette.glass },
    ],
    pedestrian: [
      {
        geometry: mergeGeometries([new CylinderGeometry(0.2, 0.22, 1.2, 8).translate(0, 0.6, 0), new SphereGeometry(0.17, 10, 8).translate(0, 1.42, 0)]),
        color: '#FFFFFF',
        tinted: true,
        pickable: true,
      },
    ],
  };
}

const keyOf = (a: AgentView): VisualKey => (a.kind === 'fleet' ? (a.cls ?? 'sedan') : a.kind === 'pedestrian' ? 'pedestrian' : a.kind);

/** Stable small hash so a car keeps its paint colour. */
const hash = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

const UP = new Vector3(0, 1, 0);
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** InstancedMesh pools per agent kind and class (architecture §6). */
export function createAgentLayer(palette: Palette): AgentLayer {
  const group = new Group();
  const all = new Map<VisualKey, Visual>();
  const owner = new Map<InstancedMesh, VisualKey>();
  const defs = visuals(palette);
  for (const key of Object.keys(defs) as VisualKey[]) {
    const parts = defs[key];
    const meshes = parts.map((p) => {
      const mesh = new InstancedMesh(p.geometry, new MeshStandardMaterial({ color: p.color ?? '#FFFFFF', roughness: 0.6, metalness: 0.05 }), CAPACITY[key]);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      owner.set(mesh, key);
      return mesh;
    });
    const tintedIndex = parts.findIndex((p) => p.tinted);
    all.set(key, { registry: createInstanceRegistry(CAPACITY[key]), meshes, tintedIndex: tintedIndex < 0 ? null : tintedIndex, pickIndex: Math.max(0, parts.findIndex((p) => p.pickable)) });
  }

  const poses = new Map<string, PoseSample>();
  const present = new Map<VisualKey, Set<string>>();
  const matrix = new Matrix4();
  const quat = new Quaternion();
  const pos = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const colour = new Color();

  return {
    group,
    update(agents, interpolated) {
      poses.clear();
      for (const set of present.values()) set.clear();
      for (const a of agents) {
        const pose = interpolated.get(a.id) ?? { x: a.x, z: a.z, heading: a.heading };
        poses.set(a.id, pose);
        const key = keyOf(a);
        const v = all.get(key) as Visual;
        const fresh = v.registry.indexOf(a.id) === undefined;
        let slot: number;
        try {
          slot = v.registry.assign(a.id);
        } catch {
          continue; // pool full: skip drawing rather than crash
        }
        let set = present.get(key);
        if (!set) {
          set = new Set();
          present.set(key, set);
        }
        set.add(a.id);
        matrix.compose(pos.set(pose.x, 0, pose.z), quat.setFromAxisAngle(UP, -pose.heading), scale);
        for (const m of v.meshes) m.setMatrixAt(slot, matrix);
        if (fresh && v.tintedIndex !== null) {
          const list = key === 'pedestrian' ? palette.peopleColours : palette.carPaints;
          colour.set(list[hash(a.id) % list.length] as string);
          (v.meshes[v.tintedIndex] as InstancedMesh).setColorAt(slot, colour);
        }
      }
      for (const [key, v] of all) {
        const seen = present.get(key);
        for (let i = 0; i < v.registry.count; i++) {
          const id = v.registry.idAt(i);
          if (id !== undefined && !seen?.has(id)) {
            v.registry.release(id);
            for (const m of v.meshes) m.setMatrixAt(i, HIDDEN);
          }
        }
        for (const m of v.meshes) {
          m.count = v.registry.count;
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
      }
    },
    pick(raycaster) {
      const targets = [...all.values()].map((v) => v.meshes[v.pickIndex] as InstancedMesh);
      for (const t of targets) t.computeBoundingSphere();
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (hit?.instanceId === undefined) return null;
      const key = targets.includes(hit.object as InstancedMesh) ? owner.get(hit.object as InstancedMesh) : undefined;
      return key ? (all.get(key)?.registry.idAt(hit.instanceId) ?? null) : null;
    },
    poseOf: (id) => poses.get(id),
  };
}
