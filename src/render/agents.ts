import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
  Quaternion,
  Vector3,
  type Raycaster,
} from 'three';
import { FLEET_CLASS_ORDER } from '../config/fleet';
import type { AgentView } from '../sim/world';
import { personAsset, walkBob } from './assets/people';
import { vehicleAsset, type VehicleAssetKind } from './assets/vehicles';
import type { FleetModel, Lod } from './assets/fleetModels';
import type { VehicleClass } from '../sim/types';
import type { PoseSample } from './interp';
import type { Palette } from './palette';
import { createInstanceRegistry, type InstanceRegistry } from './registry';

export interface AgentLayer {
  readonly group: Group;
  /** Places every agent at its interpolated pose; agents that left are hidden. `timeSec` drives the walk bob. */
  update(agents: readonly AgentView[], poses: ReadonlyMap<string, PoseSample>, timeSec?: number): void;
  /** Agent id under the ray, or null. */
  pick(raycaster: Raycaster): string | null;
  /** Last rendered pose of an agent. */
  poseOf(id: string): PoseSample | undefined;
  /** 0 day … 1 night: head- and taillights glow, beams on moving vehicles (X-2, V-2). */
  setNight(night: number): void;
  /** The tow beacon flashes while towing (V-9). */
  setBeacon(on: boolean): void;
  setPalette(palette: Palette): void;
  /** M10 (BM-12, M10-5): swaps each class with a model into it, in place; `null` classes stay procedural. */
  setFleetModels(models: ReadonlyMap<VehicleClass, FleetModel | null>): void;
  /** M10 (BM-14): the LOD Blender classes draw with; also applies to models that arrive later. */
  setDetail(lod: Lod): void;
  /** M10 (BM-13): each fleet class's model source and current LOD. */
  modelInfo(): Readonly<Record<VehicleClass, ModelInfo>>;
}

export interface ModelInfo {
  readonly source: 'blender' | 'procedural';
  readonly lod: Lod;
}

type VisualKey = VehicleAssetKind | 'pedestrian';

interface Visual {
  readonly registry: InstanceRegistry;
  readonly meshes: InstancedMesh[];
  /** Mesh that takes the per-instance paint or clothing colour, if any. */
  readonly tinted: InstancedMesh | null;
  /** Mesh used for picking. */
  readonly pickMesh: InstancedMesh;
}

const CAPACITY: Readonly<Record<VisualKey, number>> = {
  // Most of each class that can be on the map at once (fleet counts per class, F3, with headroom).
  economy: 40,
  sedan: 50,
  luxury: 16,
  suv: 40,
  minivan: 16,
  pickup: 16,
  ev: 70,
  shuttle: 4,
  cart: 6,
  tow: 2,
  van: 2,
  pedestrian: 60,
};
const FLEET_KEYS: ReadonlySet<VisualKey> = new Set(FLEET_CLASS_ORDER);

const keyOf = (a: AgentView): VisualKey => (a.kind === 'fleet' ? (a.cls ?? 'sedan') : a.kind === 'pedestrian' ? 'pedestrian' : a.kind);

/** Stable small hash so a car keeps its paint colour and a walker its stride phase. */
const hash = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Ground-level light wedge in front of a vehicle: bright at the bumper, fading out over 10 m. */
function beamGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const near = 1.1;
  const far = 2.8;
  g.setAttribute('position', new Float32BufferAttribute([0, 0, -near, 0, 0, near, 10, 0, -far, 10, 0, far], 3));
  g.setAttribute('color', new Float32BufferAttribute([1, 0.86, 0.62, 1, 0.86, 0.62, 0, 0, 0, 0, 0, 0], 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

/** Unit disc whose vertex colour fades from grey at the centre to white at the rim (multiply blend → soft shadow). */
function contactShadowGeometry(): BufferGeometry {
  const g = new CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const colours: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / 0.5);
    const v = 0.45 + 0.55 * k * k;
    colours.push(v, v, v);
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return g;
}

const BEAM_KINDS: ReadonlySet<string> = new Set(['fleet', 'shuttle', 'van', 'tow', 'cart']);
const BEAM_CAPACITY = 220;
const SHADOW_CAPACITY = 300;
const UP = new Vector3(0, 1, 0);
const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const WHITE = new Color('#FFFFFF');

/** InstancedMesh pools per agent kind, built from the Pixar-style assets (architecture §16, P2). */
export function createAgentLayer(palette: Palette): AgentLayer {
  const group = new Group();
  const all = new Map<VisualKey, Visual>();
  const owner = new Map<InstancedMesh, VisualKey>();

  const solid = (): MeshStandardMaterial => new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.08 });
  // Lamps are unlit colour that brightens past 1.0 at night, so bloom picks them up.
  const lampMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  const pool = (key: VisualKey, geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial, shadows: boolean): InstancedMesh => {
    const mesh = new InstancedMesh(geometry, material, CAPACITY[key]);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = shadows;
    mesh.frustumCulled = false;
    group.add(mesh);
    owner.set(mesh, key);
    return mesh;
  };

  for (const key of [...FLEET_CLASS_ORDER, 'shuttle', 'tow', 'van', 'cart'] as const) {
    const asset = vehicleAsset(key, palette);
    const paintMesh = pool(key, asset.paint, solid(), true);
    const trimMesh = pool(key, asset.trim, solid(), true);
    const lampMesh = pool(key, asset.lamps, lampMaterial, false);
    all.set(key, { registry: createInstanceRegistry(CAPACITY[key]), meshes: [paintMesh, trimMesh, lampMesh], tinted: FLEET_KEYS.has(key) ? paintMesh : null, pickMesh: paintMesh });
  }
  // M10 (M10-5): Blender models replace a fleet class's geometry in its three meshes; nothing else changes.
  const models = new Map<VehicleClass, FleetModel>();
  let lod: Lod = 0;
  const applyModel = (cls: VehicleClass): void => {
    const model = models.get(cls);
    const v = all.get(cls);
    if (!model || !v) return;
    const asset = model.lods[lod];
    const [paintMesh, trimMesh, lampMesh] = v.meshes;
    if (paintMesh) paintMesh.geometry = asset.paint;
    if (trimMesh) trimMesh.geometry = asset.trim;
    if (lampMesh) lampMesh.geometry = asset.lamps;
  };

  const person = personAsset('customer');
  const clothes = pool('pedestrian', person.clothing, solid(), true);
  const skin = pool('pedestrian', person.skin, solid(), true);
  all.set('pedestrian', { registry: createInstanceRegistry(CAPACITY.pedestrian), meshes: [clothes, skin], tinted: clothes, pickMesh: clothes });

  const beamMaterial = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const beams = new InstancedMesh(beamGeometry(), beamMaterial, BEAM_CAPACITY);
  beams.instanceMatrix.setUsage(DynamicDrawUsage);
  beams.count = 0;
  beams.frustumCulled = false;
  beams.renderOrder = 1;

  const shadowMaterial = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: MultiplyBlending, premultipliedAlpha: true, depthWrite: false });
  const shadows = new InstancedMesh(contactShadowGeometry(), shadowMaterial, SHADOW_CAPACITY);
  shadows.instanceMatrix.setUsage(DynamicDrawUsage);
  shadows.count = 0;
  shadows.frustumCulled = false;
  shadows.renderOrder = 1;

  const beaconMaterial = new MeshBasicMaterial({ color: '#FFB020', toneMapped: false, transparent: true });
  const beacon = new InstancedMesh(new CircleGeometry(0.9, 16).rotateX(-Math.PI / 2), beaconMaterial, 2);
  beacon.count = 0;
  beacon.frustumCulled = false;
  group.add(beams, shadows, beacon);

  const poses = new Map<string, PoseSample>();
  const present = new Map<VisualKey, Set<string>>();
  const matrix = new Matrix4();
  const quat = new Quaternion();
  const tilt = new Quaternion();
  const pos = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const colour = new Color();
  let night = 0;
  let beaconOn = false;
  let time = 0;

  return {
    group,
    update(agents, interpolated, timeSec = 0) {
      time = timeSec;
      poses.clear();
      for (const set of present.values()) set.clear();
      let shadowCount = 0;
      let lit = 0;
      let beacons = 0;
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

        quat.setFromAxisAngle(UP, -pose.heading);
        let lift = 0;
        if (key === 'pedestrian') {
          const bob = walkBob(time, a.speed, (hash(a.id) % 628) / 100);
          lift = bob.lift;
          quat.multiply(tilt.setFromAxisAngle(new Vector3(1, 0, 0), bob.sway));
        }
        matrix.compose(pos.set(pose.x, lift, pose.z), quat, scale);
        for (const m of v.meshes) m.setMatrixAt(slot, matrix);
        if (fresh && v.tinted) {
          const list = key === 'pedestrian' ? palette.peopleColours : palette.carPaints;
          colour.set(list[hash(a.id) % list.length] as string);
          v.tinted.setColorAt(slot, colour);
        } else if (fresh) {
          for (const m of v.meshes) if (m.instanceColor) m.setColorAt(slot, WHITE);
        }

        if (shadowCount < SHADOW_CAPACITY) {
          matrix.compose(pos.set(pose.x, 0.05, pose.z), quat.setFromAxisAngle(UP, -pose.heading), scale.set(a.length * 1.25, 1, a.width * 1.4));
          shadows.setMatrixAt(shadowCount++, matrix);
          scale.set(1, 1, 1);
        }
        if (night > 0.02 && lit < BEAM_CAPACITY && BEAM_KINDS.has(a.kind) && a.speed >= 0.3) {
          const half = a.length / 2;
          matrix.compose(pos.set(pose.x + Math.cos(pose.heading) * half, 0.09, pose.z + Math.sin(pose.heading) * half), quat.setFromAxisAngle(UP, -pose.heading), scale);
          beams.setMatrixAt(lit++, matrix);
        }
        if (beaconOn && a.kind === 'tow' && beacons < 2) {
          const flash = Math.sin(time * 12) > 0 ? 1 : 0.15;
          matrix.compose(pos.set(pose.x, 2.62, pose.z), quat.identity(), scale.set(flash, 1, flash));
          beacon.setMatrixAt(beacons++, matrix);
          scale.set(1, 1, 1);
        }
      }
      shadows.count = shadowCount;
      shadows.instanceMatrix.needsUpdate = true;
      beams.count = lit;
      beams.instanceMatrix.needsUpdate = true;
      beacon.count = beacons;
      beacon.instanceMatrix.needsUpdate = true;

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
      const targets = [...all.values()].map((v) => v.pickMesh);
      for (const t of targets) t.computeBoundingSphere();
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (hit?.instanceId === undefined) return null;
      const key = targets.includes(hit.object as InstancedMesh) ? owner.get(hit.object as InstancedMesh) : undefined;
      return key ? (all.get(key)?.registry.idAt(hit.instanceId) ?? null) : null;
    },
    poseOf: (id) => poses.get(id),
    setNight(value) {
      night = value;
      beamMaterial.opacity = 0.55 * value;
      beams.visible = value > 0.02;
      // Lamps glow past 1.0 at night so bloom catches them; by day they read as plain lenses.
      lampMaterial.color.setScalar(0.75 + 1.9 * value);
    },
    setBeacon(on) {
      beaconOn = on;
    },
    setPalette() {
      // Vehicle colours are baked into the Pixar-style assets and stay the same in both themes.
    },
    setFleetModels(loaded) {
      for (const [cls, model] of loaded) {
        if (!model) continue;
        models.set(cls, model);
        applyModel(cls);
      }
    },
    setDetail(next) {
      if (next === lod) return;
      lod = next;
      for (const cls of models.keys()) applyModel(cls);
    },
    modelInfo() {
      return Object.fromEntries(FLEET_CLASS_ORDER.map((cls) => [cls, { source: models.has(cls) ? 'blender' : 'procedural', lod }])) as Record<VehicleClass, ModelInfo>;
    },
  };
}
