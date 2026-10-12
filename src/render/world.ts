import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Raycaster,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hub, hubGraph, type BuildingLayout } from '../layout/hub';
import { unitMarker } from '../layout/positions';
import type { Vec2 } from '../sim/types';
import type { Palette } from './palette';

export interface WorldHandle {
  readonly group: Group;
  /** Unit id under the ray (equipment markers), or null. */
  pickUnit(raycaster: Raycaster): string | null;
  /** Every clickable unit id, in marker order. */
  readonly unitIds: readonly string[];
}

const UP = new Vector3(0, 1, 0);
const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();

const standard = (color: string, roughness = 0.9): MeshStandardMaterial => new MeshStandardMaterial({ color, roughness, metalness: 0 });

/** A box placed in the world: centre (x, y, z), size, yaw (radians, three's rotation.y). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.applyMatrix4(tmpMatrix.compose(new Vector3(x, y, z), tmpQuat.setFromAxisAngle(UP, yaw), new Vector3(1, 1, 1)));
  return g;
}

/** Flat strip following a polyline at height y. */
function ribbon(points: readonly Vec2[], width: number, y: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const half = width / 2;
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)] as Vec2;
    const next = points[Math.min(points.length - 1, i + 1)] as Vec2;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    positions.push(p.x + nx * half, y, p.z + nz * half, p.x - nx * half, y, p.z - nz * half);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(indices);
  return g;
}

const merged = (parts: BufferGeometry[]): BufferGeometry => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const p of parts) p.dispose();
  return g;
};

function roads(): { asphalt: BufferGeometry; walkway: BufferGeometry } {
  const asphalt: BufferGeometry[] = [];
  const walkway: BufferGeometry[] = [];
  for (const e of hubGraph().edges) {
    if (e.kinds?.includes('pedestrian')) walkway.push(ribbon(e.path.points, 2.4, 0.04));
    else asphalt.push(ribbon(e.path.points, Math.max(e.width, 3) + 0.8, 0.02));
  }
  return { asphalt: merged(asphalt), walkway: merged(walkway) };
}

/** Stall separators in the Ready lot and zebra stripes where walkways cross roads. */
function markings(): BufferGeometry {
  const graph = hubGraph();
  const parts: BufferGeometry[] = [];
  for (const u of hub.stations.slot.units) {
    const e = graph.edge(u.parkEdge);
    const a = e.path.pointAt(0);
    const h = e.path.headingAt(0);
    const len = 13;
    for (const side of [-1.6, 1.6]) {
      const cx = a.x + Math.cos(h) * (len / 2) - Math.sin(h) * side;
      const cz = a.z + Math.sin(h) * (len / 2) + Math.cos(h) * side;
      parts.push(box(len, 0.02, 0.12, cx, 0.06, cz, -h));
    }
  }
  for (const e of graph.edges) {
    if (!e.kinds?.includes('pedestrian')) continue;
    for (const { interval } of graph.zonesOn(e.id)) {
      for (let s = interval.sEnter + 0.4; s < interval.sExit - 0.2; s += 0.9) {
        const p = e.path.pointAt(s);
        const h = e.path.headingAt(s);
        parts.push(box(0.45, 0.02, 2.6, p.x, 0.07, p.z, -h));
      }
    }
  }
  return merged(parts);
}

const CANOPIES = new Set(['canopy', 'wash', 'service', 'evHub', 'fuel', 'depot']);

interface BuildingParts {
  clay: BufferGeometry[];
  roof: BufferGeometry[];
  accent: BufferGeometry[];
  glass: BufferGeometry[];
}

function building(b: BuildingLayout, out: BuildingParts): void {
  if (b.id === 'lot') return;
  if (b.id === 'gates') {
    // Booth between the two exit lanes, plus barrier arms.
    out.clay.push(box(2.4, 2.6, 1.4, b.x + 5, 1.3, b.z));
    out.accent.push(box(2.6, 0.25, 1.6, b.x + 5, 2.7, b.z));
    for (const dz of [-3, 3]) out.accent.push(box(0.15, 0.15, 3.2, b.x - 1.6, 1.1, b.z + dz));
    return;
  }
  if (CANOPIES.has(b.id)) {
    // Open canopy so the cars underneath stay visible.
    const hx = b.width / 2 - 0.5;
    const hz = b.depth / 2 - 0.5;
    for (const [px, pz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [0, -hz], [0, hz]] as const) {
      out.clay.push(box(0.5, b.height, 0.5, b.x + px, b.height / 2, b.z + pz));
    }
    // Roof as an open frame (edge beams plus cross beams) so the bays stay visible from above.
    const y = b.height + 0.25;
    out.roof.push(box(0.4, 0.5, b.depth, b.x - b.width / 2, y, b.z), box(0.4, 0.5, b.depth, b.x + b.width / 2, y, b.z));
    for (let i = 1; i < 4; i++) out.roof.push(box(0.25, 0.3, b.depth, b.x - b.width / 2 + (b.width * i) / 4, y, b.z));
    out.accent.push(box(b.width + 0.4, 0.45, 0.35, b.x, y, b.z + b.depth / 2));
    out.accent.push(box(b.width + 0.4, 0.45, 0.35, b.x, y, b.z - b.depth / 2));
    return;
  }
  // Solid building (terminal): clay body, roof slab, glass front and a gold band facing the lot.
  out.clay.push(box(b.width, b.height, b.depth, b.x, b.height / 2, b.z));
  out.roof.push(box(b.width + 1, 0.6, b.depth + 1, b.x, b.height + 0.3, b.z));
  out.glass.push(box(0.3, b.height * 0.55, b.depth * 0.8, b.x + b.width / 2 + 0.1, b.height * 0.35, b.z));
  out.accent.push(box(0.4, 1.2, b.depth * 0.9, b.x + b.width / 2 + 0.2, b.height - 1.4, b.z));
}

/** Small instanced props: palms around the terminal and light poles along the lot. */
function props(palette: Palette): Group {
  const g = new Group();
  const palms: Vec2[] = [];
  for (let i = 0; i < 7; i++) palms.push({ x: -95 + i * 9, z: 92 }, { x: -95 + i * 9, z: 156 });
  const trunk = new InstancedMesh(new CylinderGeometry(0.25, 0.35, 7, 6).translate(0, 3.5, 0), standard(palette.trunk), palms.length);
  const crown = new InstancedMesh(new IcosahedronGeometry(2.2, 0).translate(0, 7.6, 0), standard(palette.foliage), palms.length);
  palms.forEach((p, i) => {
    tmpMatrix.makeTranslation(p.x, 0, p.z);
    trunk.setMatrixAt(i, tmpMatrix);
    crown.setMatrixAt(i, tmpMatrix);
  });
  trunk.castShadow = crown.castShadow = true;

  const poles: Vec2[] = [];
  for (const x of [-4, 20.5, 42.5, 68]) for (const z of [100, 120, 140, 160]) poles.push({ x, z });
  const pole = new InstancedMesh(new CylinderGeometry(0.12, 0.15, 9, 6).translate(0, 4.5, 0), standard('#9AA0AA'), poles.length);
  const lamp = new InstancedMesh(new BoxGeometry(1.4, 0.25, 0.5).translate(0, 9, 0), standard(palette.accent, 0.5), poles.length);
  poles.forEach((p, i) => {
    tmpMatrix.makeTranslation(p.x, 0, p.z);
    pole.setMatrixAt(i, tmpMatrix);
    lamp.setMatrixAt(i, tmpMatrix);
  });
  g.add(trunk, crown, pole, lamp);
  return g;
}

/** Static scene: ground, roads, lot, markings, buildings, equipment markers and props (W-1..W-4). */
export function buildWorld(palette: Palette): WorldHandle {
  const group = new Group();

  const ground = new Mesh(new PlaneGeometry(1200, 900).rotateX(-Math.PI / 2), standard(palette.ground, 1));
  ground.position.set(-10, 0, 30);
  ground.receiveShadow = true;
  ground.name = 'ground';

  const { asphalt, walkway } = roads();
  const roadMesh = new Mesh(asphalt, standard(palette.asphalt, 0.95));
  const walkMesh = new Mesh(walkway, standard(palette.walkway, 0.95));
  roadMesh.receiveShadow = walkMesh.receiveShadow = true;

  const lotLayout = hub.buildings.find((b) => b.id === 'lot');
  const lot = lotLayout
    ? new Mesh(new BoxGeometry(lotLayout.width, 0.04, lotLayout.depth).translate(lotLayout.x, 0.03, lotLayout.z), standard(palette.asphalt, 0.95))
    : new Group();
  if (lot instanceof Mesh) lot.receiveShadow = true;

  const markingMesh = new Mesh(markings(), new MeshBasicMaterial({ color: palette.marking }));

  const parts: BuildingParts = { clay: [], roof: [], accent: [], glass: [] };
  for (const b of hub.buildings) building(b, parts);
  const buildingMeshes = [
    new Mesh(merged(parts.clay), standard(palette.clay)),
    new Mesh(merged(parts.roof), standard(palette.roof)),
    new Mesh(merged(parts.accent), standard(palette.accent, 0.5)),
    new Mesh(merged(parts.glass), standard(palette.glass, 0.3)),
  ];
  for (const m of buildingMeshes) m.castShadow = m.receiveShadow = true;

  // Equipment markers: one post per clickable unit, with a gold cap, plus an invisible, larger hit box.
  const unitIds = Object.values(hub.stations).flatMap((s) => s.units.map((u) => u.id));
  const post = new InstancedMesh(new BoxGeometry(0.6, 1.6, 0.6).translate(0, 0.8, 0), standard('#5B5F6B', 0.7), unitIds.length);
  const cap = new InstancedMesh(new BoxGeometry(0.7, 0.25, 0.7).translate(0, 1.72, 0), standard(palette.accent, 0.5), unitIds.length);
  const hitMaterial = new MeshBasicMaterial();
  hitMaterial.visible = false;
  const hit = new InstancedMesh(new BoxGeometry(2.4, 2.6, 2.4).translate(0, 1.3, 0), hitMaterial, unitIds.length);
  unitIds.forEach((id, i) => {
    const m = unitMarker(id);
    tmpMatrix.compose(new Vector3(m.x, 0, m.z), tmpQuat.setFromAxisAngle(UP, -m.heading), new Vector3(1, 1, 1));
    post.setMatrixAt(i, tmpMatrix);
    cap.setMatrixAt(i, tmpMatrix);
    hit.setMatrixAt(i, tmpMatrix);
  });
  post.castShadow = true;
  hit.computeBoundingSphere();

  group.add(ground, roadMesh, walkMesh, lot, markingMesh, ...buildingMeshes, post, cap, hit, props(palette));

  return {
    group,
    unitIds,
    pickUnit(raycaster) {
      const hits = raycaster.intersectObject(hit, false);
      const first = hits[0];
      return first?.instanceId !== undefined ? (unitIds[first.instanceId] ?? null) : null;
    },
  };
}
