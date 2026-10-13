import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Raycaster,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTAGE_KINDS } from '../config/scenarios';
import { hub } from '../layout/hub';
import { unitMarker, unitPose, unitStop, type Pose } from '../layout/positions';
import { buildingAsset } from './assets/buildings';
import { GATE_ARM_AHEAD_M, type DetailStates } from './details';
import { assemble, paint, place } from './kit/assemble';
import { cylinder, roundedBox } from './kit/shapes';
import { buildLandscape } from './landscape';
import { createLampsView } from './lampsView';
import { airportPlan } from '../airport/plan';
import type { Palette } from './palette';

export interface WorldConditions {
  /** 0 dry … 1 soaked: darker, glossier asphalt. */
  readonly wetness: number;
  /** 0 day … 1 night: windows, signage and lamps glow. */
  readonly night: number;
}

export interface WorldFrame {
  readonly dt: number;
  /** Wall-clock seconds since start (lamp stagger, brushes, beacons). */
  readonly wallTime: number;
  readonly reducedMotion: boolean;
  readonly poolFraction: number;
  readonly details: DetailStates;
}

export interface WorldHandle {
  readonly group: Group;
  setConditions(conditions: WorldConditions): void;
  setPalette(palette: Palette): void;
  /** Per-frame animation: lamps, wash brushes, garage doors, gate barriers, charger lights (V-6, V-9). */
  update(frame: WorldFrame): void;
  /** Mean lamp brightness, 0 off … 1 all lit. */
  lampsLit(): number;
  /** Unit id under the ray (equipment markers), or null. */
  pickUnit(raycaster: Raycaster): string | null;
  /** Every clickable unit id, in marker order. */
  readonly unitIds: readonly string[];
}

const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const ONE = new Vector3(1, 1, 1);
const tmp = new Matrix4();
const q = new Quaternion();

/** Instances placed beside each pose: `lateral` metres to the side, `ahead` metres forward. */
const instanced = (geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial, poses: readonly Pose[], lateral = 0, ahead = 0): InstancedMesh => {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, poses.length));
  poses.forEach((p, i) => {
    const x = p.x + Math.cos(p.heading) * ahead - Math.sin(p.heading) * lateral;
    const z = p.z + Math.sin(p.heading) * ahead + Math.cos(p.heading) * lateral;
    mesh.setMatrixAt(i, tmp.compose(new Vector3(x, 0, z), q.setFromAxisAngle(UP, -p.heading), ONE));
  });
  mesh.count = poses.length;
  mesh.castShadow = true;
  return mesh;
};

// ---------- equipment beside the bays (the click targets stay invisible at unitMarker) ----------

const chargerPillar = (): BufferGeometry =>
  assemble([
    place(paint(roundedBox(0.55, 1.7, 0.65, 0.18, 2), '#F4F2EC'), { y: 0.85 }),
    place(paint(roundedBox(0.6, 0.16, 0.7, 0.06, 1), '#F2B33D'), { y: 1.75 }),
    place(paint(roundedBox(0.05, 0.42, 0.42, 0.03, 1), '#1F2A3A'), { x: 0.28, y: 1.2 }),
    place(paint(cylinder(0.04, 0.04, 1.1, 6), '#2A2C33'), { x: 0.3, y: 0.6, z: 0.24, rotZ: 0.5 }),
  ]);
/** Traffic cone with a white reflective band (S-2 outages). */
const cone = (): BufferGeometry =>
  assemble([
    place(paint(roundedBox(0.5, 0.06, 0.5, 0.02, 1), '#E8571E'), { y: 0.03 }),
    place(paint(cylinder(0.05, 0.2, 0.62, 10), '#F26A21'), { y: 0.37 }),
    place(paint(cylinder(0.105, 0.135, 0.12, 10), '#F4F4F2'), { y: 0.42 }),
  ]);
const warningLight = (): BufferGeometry => place(cylinder(0.07, 0.07, 0.09, 8), { y: 0.73 });
/** Three cones across the entry of an offline bay, behind its parking spot (outside the wash tunnel). */
const CONE_LATERAL = [-1.4, 0, 1.4];
const CONE_BEHIND = 3.2;
/** Chunky, toy-like cones read better from the hub camera's height. */
const CONE_SCALE = new Vector3(1.4, 1.4, 1.4);
/** Wash bays sit inside the tunnel: their cones stand just outside its entrance instead. */
const WASH_ENTRY_GAP = 1.5;

const statusLight = (): BufferGeometry => place(roundedBox(0.06, 0.12, 0.3, 0.03, 1), { x: 0.29, y: 1.55 });

const pumpIsland = (): BufferGeometry =>
  assemble([
    place(paint(roundedBox(1.1, 0.25, 1.6, 0.1, 1), '#C9CCD4'), { y: 0.12 }),
    place(paint(roundedBox(0.6, 1.8, 0.9, 0.16, 2), '#F4F2EC'), { y: 1.1 }),
    place(paint(roundedBox(0.65, 0.3, 0.95, 0.08, 1), '#E0262B'), { y: 1.9 }),
    place(paint(roundedBox(0.05, 0.35, 0.5, 0.03, 1), '#9FE3FF'), { x: 0.31, y: 1.35 }),
  ]);

const bollard = (): BufferGeometry =>
  assemble([place(paint(cylinder(0.14, 0.16, 0.8, 8), '#E9E6DF'), { y: 0.4 }), place(paint(cylinder(0.16, 0.16, 0.14, 8), '#F2B33D'), { y: 0.82 })]);

const brush = (): BufferGeometry =>
  assemble([
    place(paint(cylinder(0.38, 0.38, 2.3, 12), '#3E7BD6'), { y: 1.3 }),
    place(paint(cylinder(0.4, 0.4, 0.25, 12), '#F2B33D'), { y: 0.7 }),
    place(paint(cylinder(0.4, 0.4, 0.25, 12), '#F2B33D'), { y: 1.9 }),
    place(paint(cylinder(0.08, 0.08, 0.4, 6), '#8D939E'), { y: 2.6 }),
  ]);

/** Roll-up door: slats from the floor up to 3.8 m, spanning one bay. */
const rollerDoor = (): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) parts.push(place(paint(roundedBox(0.12, 0.46, 5.4, 0.04, 1), i % 2 ? '#D9DCE2' : '#C9CDD4'), { y: 0.25 + i * 0.47 }));
  return assemble(parts);
};

/** Red-and-white barrier arm reaching along −z from its pivot. */
const barrierArm = (): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) parts.push(place(paint(roundedBox(0.12, 0.12, 0.55, 0.04, 1), i % 2 ? '#E0262B' : '#F7F3EA'), { z: -0.3 - i * 0.55 }));
  return assemble(parts);
};

const armLift = new Quaternion();
/**
 * Gate arm orientation (V-9): yawed to reach across its lane (towardLane 0 → −z, π → +z), then
 * swung about its pivot so the tip rises (lift 0 flat … 1 vertical). Returns a shared quaternion.
 */
export function gateArmRotation(lift: number, towardLane: number): Quaternion {
  // The arm reaches along local −z, so a positive turn about +x lifts its tip.
  return q.setFromAxisAngle(UP, towardLane).multiply(armLift.setFromAxisAngle(X_AXIS, lift * (Math.PI / 2)));
}

/** Static scene (V-1..V-6): landscape, Pixar-style buildings, equipment, lamps and live details. */
export function buildWorld(palette: Palette): WorldHandle {
  const group = new Group();
  const landscape = buildLandscape(palette);
  const lampsView = createLampsView(airportPlan().masts);

  // Buildings: every solid, glass and glow part merged into one mesh each (P1).
  const solids: BufferGeometry[] = [];
  const glasses: BufferGeometry[] = [];
  const glows: BufferGeometry[] = [];
  for (const b of hub.buildings) {
    const a = buildingAsset(b, palette);
    solids.push(a.solid);
    glasses.push(a.glass);
    glows.push(a.glow);
  }
  const solidMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.02 });
  const glassMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.55, emissive: '#FFCF8A', emissiveIntensity: 0 });
  const glowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const solid = new Mesh(mergeGeometries(solids), solidMat);
  const glass = new Mesh(mergeGeometries(glasses), glassMat);
  const glow = new Mesh(mergeGeometries(glows), glowMat);
  solid.castShadow = solid.receiveShadow = true;
  glass.renderOrder = 2;

  // Equipment beside each bay.
  const equipMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  const chargerIds = hub.stations.charger.units.map((u) => u.id);
  const chargerPoses = chargerIds.map((id) => unitPose(id));
  const chargers = instanced(chargerPillar(), equipMat, chargerPoses, 2, 1.6);
  const statusMat = new MeshBasicMaterial({ toneMapped: false });
  const status = instanced(statusLight(), statusMat, chargerPoses, 2, 1.6);
  status.castShadow = false;
  const pumps = instanced(pumpIsland(), equipMat, hub.stations.pump.units.map((u) => unitPose(u.id)), 3, 0.8);
  const bollards = instanced(bollard(), equipMat, hub.stations.slot.units.map((u) => unitPose(u.id)), 1.6, 2.4);

  // Invisible, generous hit boxes at the click targets (unchanged from M1).
  const unitIds = Object.values(hub.stations).flatMap((s) => s.units.map((u) => u.id));
  const hitMaterial = new MeshBasicMaterial();
  hitMaterial.visible = false;
  const hit = new InstancedMesh(new BoxGeometry(2.4, 2.6, 2.4).translate(0, 1.3, 0), hitMaterial, unitIds.length);
  unitIds.forEach((id, i) => {
    const m = unitMarker(id);
    hit.setMatrixAt(i, tmp.compose(new Vector3(m.x, 0, m.z), q.setFromAxisAngle(UP, -m.heading), ONE));
  });
  hit.computeBoundingSphere();

  // Outages (S-2): cones and a flashing red light, shown only for offline units.
  const washHall = hub.buildings.find((b) => b.id === 'wash');
  const outageIds = OUTAGE_KINDS.flatMap((k) => hub.stations[k].units.map((u) => u.id));
  const cones = new InstancedMesh(cone(), equipMat, outageIds.length * CONE_LATERAL.length);
  const warnMat = new MeshBasicMaterial({ color: '#FF2A1F', toneMapped: false });
  const warnings = new InstancedMesh(warningLight(), warnMat, outageIds.length);
  cones.count = 0;
  warnings.count = 0;
  cones.castShadow = true;
  let offlineKey = '';
  const at = new Vector3();
  const placeCones = (offline: ReadonlySet<string>): void => {
    const ids = outageIds.filter((id) => offline.has(id));
    const key = ids.join(',');
    if (key === offlineKey) return;
    offlineKey = key;
    let n = 0;
    ids.forEach((id, i) => {
      const p = unitPose(id);
      const back = washIds.includes(id) && washHall
        ? { x: washHall.x - washHall.width / 2 - WASH_ENTRY_GAP, z: p.z }
        : { x: p.x - Math.cos(p.heading) * CONE_BEHIND, z: p.z - Math.sin(p.heading) * CONE_BEHIND };
      q.setFromAxisAngle(UP, -p.heading);
      for (const lateral of CONE_LATERAL) {
        at.set(back.x - Math.sin(p.heading) * lateral, 0, back.z + Math.cos(p.heading) * lateral);
        cones.setMatrixAt(n++, tmp.compose(at, q, CONE_SCALE));
        if (lateral === 0) warnings.setMatrixAt(i, tmp.compose(at, q, CONE_SCALE));
      }
    });
    cones.count = n;
    warnings.count = ids.length;
    cones.instanceMatrix.needsUpdate = true;
    warnings.instanceMatrix.needsUpdate = true;
    cones.computeBoundingSphere();
    warnings.computeBoundingSphere();
  };

  // Live details (V-9): two brushes per wash bay, a roll-up door per service bay, an arm per gate.
  const washIds = hub.stations.wash.units.map((u) => u.id);
  const brushPoses = washIds.flatMap((id) => [-1.45, 1.45].map((side) => ({ ...unitPose(id), side })));
  const brushes = new InstancedMesh(brush(), equipMat, brushPoses.length);
  brushes.castShadow = true;
  const serviceIds = hub.stations.service.units.map((u) => u.id);
  const doors = new InstancedMesh(rollerDoor(), equipMat, serviceIds.length);
  doors.castShadow = true;
  const gateIds = hub.stations.gate.units.map((u) => u.id);
  const gateStops = gateIds.map((id) => unitStop(id));
  const arms = new InstancedMesh(barrierArm(), equipMat, gateIds.length);
  arms.castShadow = true;

  const spin = new Float32Array(brushPoses.length);
  const doorOpen = new Float32Array(serviceIds.length);
  const armUp = new Float32Array(gateIds.length);
  const colour = new Color();
  const scale = new Vector3();
  const pos = new Vector3();

  const placeDetails = (): void => {
    brushPoses.forEach((p, i) => {
      pos.set(p.x - Math.sin(p.heading) * p.side, 0, p.z + Math.cos(p.heading) * p.side);
      brushes.setMatrixAt(i, tmp.compose(pos, q.setFromAxisAngle(UP, spin[i] ?? 0), ONE));
    });
    brushes.instanceMatrix.needsUpdate = true;
    serviceIds.forEach((id, i) => {
      const open = doorOpen[i] ?? 0;
      // Slats roll up into the header: the door shortens and rises.
      doors.setMatrixAt(i, tmp.compose(pos.set(106, 3.6 * open, unitPose(id).z), q.identity(), scale.set(1, 1 - 0.9 * open, 1)));
    });
    doors.instanceMatrix.needsUpdate = true;
    gateStops.forEach((s, i) => {
      // Pivot on a post between the lanes, just past the stop line; the arm reaches across its own lane and lifts to vertical.
      const towardLane = s.z < 190 ? 0 : Math.PI;
      const armX = s.x + Math.cos(s.heading) * GATE_ARM_AHEAD_M;
      arms.setMatrixAt(i, tmp.compose(pos.set(armX, 1.05, s.z < 190 ? 189.5 : 190.5), gateArmRotation(armUp[i] ?? 0, towardLane), ONE));
    });
    arms.instanceMatrix.needsUpdate = true;
  };
  placeDetails();

  group.add(landscape.group, solid, glass, glow, chargers, status, pumps, bollards, hit, brushes, doors, arms, cones, warnings, lampsView.group);

  let night = 0;
  let lampsLit = 0;

  return {
    group,
    unitIds,
    setConditions(c) {
      night = c.night;
      landscape.setConditions(c.wetness);
      glassMat.emissiveIntensity = 0.12 * c.night;
      // Signage and screens glow past 1.0 at night so bloom picks them up.
      glowMat.color.setScalar(0.55 + 1.7 * c.night);
    },
    setPalette(p) {
      landscape.setPalette(p);
    },
    update(frame) {
      const ease = 1 - Math.exp(-frame.dt * 4);
      brushPoses.forEach((_, i) => {
        if (!frame.reducedMotion && frame.details.spinningWash.has(washIds[Math.floor(i / 2)] as string)) {
          spin[i] = ((spin[i] ?? 0) + frame.dt * 7 * (i % 2 ? 1 : -1)) % (Math.PI * 2);
        }
      });
      serviceIds.forEach((id, i) => {
        const target = frame.details.openDoors.has(id) ? 1 : 0;
        doorOpen[i] = (doorOpen[i] ?? 0) + (target - (doorOpen[i] ?? 0)) * ease;
      });
      gateIds.forEach((id, i) => {
        const target = frame.details.raisedBarriers.has(id) ? 1 : 0;
        armUp[i] = (armUp[i] ?? 0) + (target - (armUp[i] ?? 0)) * ease;
      });
      placeDetails();
      chargerIds.forEach((id, i) => {
        const charging = frame.details.chargers.get(id) === 'charging';
        status.setColorAt(i, colour.set(charging ? '#3BE37A' : '#7FA8FF').multiplyScalar(charging ? 1.6 + 0.6 * night : 0.6));
      });
      if (status.instanceColor) status.instanceColor.needsUpdate = true;
      placeCones(frame.details.offlineUnits);
      const flash = frame.reducedMotion || Math.sin(frame.wallTime * 6) > 0;
      warnMat.color.set('#FF2A1F').multiplyScalar(flash ? 1.4 + night : 0.25);
      lampsLit = lampsView.update({ night, wallTime: frame.wallTime, reducedMotion: frame.reducedMotion, poolFraction: frame.poolFraction });
    },
    lampsLit: () => lampsLit,
    pickUnit(raycaster) {
      const first = raycaster.intersectObject(hit, false)[0];
      return first?.instanceId !== undefined ? (unitIds[first.instanceId] ?? null) : null;
    },
  };
}
