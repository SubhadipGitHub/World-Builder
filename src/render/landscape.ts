import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { distanceToEdge } from '../layout/geometry';
import { hub, hubGraph } from '../layout/hub';
import { lampPlacements } from '../layout/lamps';
import { hubBounds } from '../layout/positions';
import { sitePlan } from '../layout/site';
import { createRng } from '../sim/rng';
import type { Vec2 } from '../sim/types';
import { assemble, paint, place } from './kit/assemble';
import { blob, cylinder, roundedBox } from './kit/shapes';
import { patchFoliageSway, type FoliageSway } from './foliageSway';
import type { Palette } from './palette';

export interface Landscape {
  readonly group: Group;
  /** Wind sway on trees, palms and bushes (M9, FE-13). */
  readonly sway: FoliageSway;
  setConditions(wetness: number): void;
  setPalette(palette: Palette): void;
}

const UP = new Vector3(0, 1, 0);

/** Flat strip following a polyline at height y, optionally offset sideways. */
function ribbon(points: readonly Vec2[], width: number, y: number, offset = 0): BufferGeometry {
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
    const cx = p.x + nx * offset;
    const cz = p.z + nz * offset;
    positions.push(cx + nx * half, y, cz + nz * half, cx - nx * half, y, cz - nz * half);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(indices);
  return g.toNonIndexed();
}

const merged = (parts: BufferGeometry[]): BufferGeometry => {
  if (parts.length === 0) return new BufferGeometry();
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const p of parts) p.dispose();
  return g;
};

const flatBox = (w: number, d: number, x: number, z: number, y: number, yaw: number): BufferGeometry =>
  place(roundedBox(w, 0.02, d, 0.005, 1), { x, y, z, rotY: yaw });

/** Grass with gentle, deterministic colour variation (multiplies the palette's grass colour). */
function grass(): BufferGeometry {
  const g = new PlaneGeometry(1300, 1000, 90, 70).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const colours: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = 0.92 + 0.08 * Math.sin(x * 0.045) * Math.cos(z * 0.06) + 0.05 * Math.sin((x + z) * 0.13);
    colours.push(n, n * 1.02, n * 0.96);
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return g;
}

function roads(): { asphalt: BufferGeometry; shoulder: BufferGeometry; walkway: BufferGeometry; lines: BufferGeometry } {
  const asphalt: BufferGeometry[] = [];
  const shoulder: BufferGeometry[] = [];
  const walkway: BufferGeometry[] = [];
  const lines: BufferGeometry[] = [];
  for (const e of hubGraph().edges) {
    const pts = e.path.points;
    if (e.kinds?.includes('pedestrian')) {
      walkway.push(ribbon(pts, 2.4, 0.045));
      continue;
    }
    const w = Math.max(e.width, 3) + 0.8;
    asphalt.push(ribbon(pts, w, 0.03));
    // A wider concrete band under every road reads as kerbs and sidewalks.
    shoulder.push(ribbon(pts, w + 2.2, 0.015));
    if (e.speedLimit >= 9 && e.length > 20) {
      for (const side of [1, -1]) lines.push(ribbon(pts, 0.14, 0.04, side * (w / 2 - 0.35)));
      // Direction arrows along main roads.
      for (let s = 15; s < e.length - 5; s += 32) {
        const p = e.path.pointAt(s);
        const h = e.path.headingAt(s);
        lines.push(flatBox(2.2, 0.22, p.x, p.z, 0.041, -h));
        for (const sz of [1, -1]) {
          const tip = { x: p.x + Math.cos(h) * 1.0, z: p.z + Math.sin(h) * 1.0 };
          lines.push(flatBox(1.0, 0.22, tip.x - Math.cos(h + sz * 0.6) * 0.45, tip.z - Math.sin(h + sz * 0.6) * 0.45, 0.041, -(h + sz * 0.6)));
        }
      }
    }
  }
  // Public roads continue west through the fence towards Airport Blvd (M5, G1).
  for (const ext of sitePlan().roadExtensions) {
    const pts = [
      { x: ext.fromX, z: ext.z },
      { x: ext.toX, z: ext.z },
    ];
    const w = Math.max(ext.width, 3) + 0.8;
    asphalt.push(ribbon(pts, w, 0.03));
    shoulder.push(ribbon(pts, w + 2.2, 0.015));
    for (const side of [1, -1]) lines.push(ribbon(pts, 0.14, 0.04, side * (w / 2 - 0.35)));
  }
  return { asphalt: merged(asphalt), shoulder: merged(shoulder), walkway: merged(walkway), lines: merged(lines) };
}

/** Stall separators in the Ready lot and zebra stripes where walkways cross roads. */
function markings(): BufferGeometry {
  const graph = hubGraph();
  const parts: BufferGeometry[] = [];
  for (const u of hub.stations.slot.units) {
    const e = graph.edge(u.parkEdge);
    const a = e.path.pointAt(0);
    const h = e.path.headingAt(0);
    for (const side of [-1.6, 1.6]) {
      parts.push(flatBox(13, 0.12, a.x + Math.cos(h) * 6.5 - Math.sin(h) * side, a.z + Math.sin(h) * 6.5 + Math.cos(h) * side, 0.06, -h));
    }
  }
  for (const e of graph.edges) {
    if (!e.kinds?.includes('pedestrian')) continue;
    for (const { interval } of graph.zonesOn(e.id)) {
      for (let s = interval.sEnter + 0.4; s < interval.sExit - 0.2; s += 0.9) {
        const p = e.path.pointAt(s);
        parts.push(flatBox(0.45, 2.6, p.x, p.z, 0.07, -e.path.headingAt(s)));
      }
    }
  }
  return merged(parts);
}

// ---------- trees and bushes ----------

const LEAF = ['#5FA34F', '#6DB65A', '#4F9447'];

function roundTree(): BufferGeometry {
  return assemble([
    place(paint(cylinder(0.22, 0.32, 3.2, 8), '#8A6244'), { y: 1.6 }),
    place(paint(blob(2.1, 1), LEAF[0] as string), { y: 4.2 }),
    place(paint(blob(1.5, 1), LEAF[1] as string), { y: 5.4, x: 0.5, z: -0.3 }),
    place(paint(blob(1.2, 1), LEAF[2] as string), { y: 4.6, x: -1.1, z: 0.6 }),
  ]);
}

function conifer(): BufferGeometry {
  return assemble([
    place(paint(cylinder(0.2, 0.28, 1.6, 8), '#7A5638'), { y: 0.8 }),
    place(paint(cylinder(0.05, 1.9, 2.6, 9), '#3F7D46'), { y: 2.6 }),
    place(paint(cylinder(0.05, 1.45, 2.2, 9), '#478C4E'), { y: 3.9 }),
    place(paint(cylinder(0.02, 0.95, 1.8, 9), '#52995A'), { y: 5.0 }),
  ]);
}

function palm(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // Gently curved trunk from stacked segments.
  for (let i = 0; i < 6; i++) parts.push(place(paint(cylinder(0.2 - i * 0.015, 0.24 - i * 0.015, 1.25, 7), i % 2 ? '#9C7650' : '#8E6A47'), { y: 0.6 + i * 1.15, x: i * i * 0.025 }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(place(paint(roundedBox(2.6, 0.08, 0.55, 0.04, 1), i % 2 ? '#5FA34F' : '#4F9447'), { x: 0.9 + Math.cos(a) * 1.2, y: 7.0, z: Math.sin(a) * 1.2, rotY: -a, rotZ: -0.35 }));
  }
  parts.push(place(paint(blob(0.32, 0), '#7A5A2E'), { x: 0.9, y: 6.8 }));
  return assemble(parts);
}

function bush(): BufferGeometry {
  return assemble([place(paint(blob(0.9, 1), '#5A9C4C'), { y: 0.55, scale: [1, 0.72, 1] }), place(paint(blob(0.6, 1), '#6AAE58'), { y: 0.75, x: 0.5, z: 0.2 })]);
}

/** Deterministic planting that keeps clear of roads, buildings, the lot and lamps. */
function plant(): { round: Matrix4[]; conifer: Matrix4[]; palm: Matrix4[]; bush: Matrix4[] } {
  const rng = createRng('goldlane-trees');
  const edges = hubGraph().edges;
  const lamps = lampPlacements();
  // Keep trees off the M5 site items (signs, booths, cameras, props, flags, the pylon).
  const site = sitePlan();
  const sitePoints: Vec2[] = [
    site.pylon,
    ...site.flags,
    ...site.booths.map((x) => x.pose),
    ...site.directionSigns,
    ...site.cctv,
    ...site.callBoxes,
    ...site.bollards,
    ...site.props.map((x) => x.pose),
    ...site.gantries.flatMap((g) => [1, -1].map((side) => ({ x: g.x - Math.sin(g.heading) * side * (g.span / 2), z: g.z + Math.cos(g.heading) * side * (g.span / 2) }))),
  ];
  const b = hubBounds(10);
  const out = { round: [] as Matrix4[], conifer: [] as Matrix4[], palm: [] as Matrix4[], bush: [] as Matrix4[] };
  const free = (p: Vec2, clearance: number): boolean => {
    for (const bl of hub.buildings) if (Math.abs(p.x - bl.x) < bl.width / 2 + clearance && Math.abs(p.z - bl.z) < bl.depth / 2 + clearance) return false;
    for (const l of lamps) if (Math.hypot(l.x - p.x, l.z - p.z) < 3) return false;
    for (const q of sitePoints) if (Math.hypot(q.x - p.x, q.z - p.z) < 2.5 + clearance) return false;
    for (const e of edges) if (distanceToEdge(p, e) < e.width / 2 + 2.2 + clearance) return false;
    return true;
  };
  const m = (p: Vec2, s: number): Matrix4 => new Matrix4().compose(new Vector3(p.x, 0, p.z), new Quaternion().setFromAxisAngle(UP, rng.range(0, Math.PI * 2)), new Vector3(s, s, s));
  for (let x = b.minX; x <= b.maxX; x += 13) {
    for (let z = b.minZ; z <= b.maxZ; z += 13) {
      const p = { x: x + rng.range(-5, 5), z: z + rng.range(-5, 5) };
      const roll = rng.next();
      if (roll < 0.45 || !free(p, 1.5)) continue;
      const nearTerminal = Math.hypot(p.x + 65, p.z - 122) < 60;
      const kind = nearTerminal && rng.chance(0.6) ? 'palm' : rng.chance(0.6) ? 'round' : 'conifer';
      out[kind].push(m(p, rng.range(0.8, 1.25)));
      if (rng.chance(0.5)) {
        const q = { x: p.x + rng.range(-4, 4), z: p.z + rng.range(-4, 4) };
        if (free(q, 0.5)) out.bush.push(m(q, rng.range(0.7, 1.3)));
      }
    }
  }
  return out;
}

function instanced(geometry: BufferGeometry, material: MeshStandardMaterial, matrices: readonly Matrix4[]): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, matrices.length));
  matrices.forEach((mx, i) => {
    mesh.setMatrixAt(i, mx);
  });
  mesh.count = matrices.length;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Grass, roads with kerbs, lane markings, the lot and planting (V-4). */
export function buildLandscape(palette: Palette): Landscape {
  const group = new Group();
  const standard = (color: string, roughness = 0.9, vertexColors = false): MeshStandardMaterial => new MeshStandardMaterial({ color, roughness, metalness: 0, vertexColors });
  const mats = {
    grass: standard(palette.grass, 1, true),
    asphalt: standard(palette.asphalt, 0.95),
    shoulder: standard('#A9ACB4', 0.95),
    walkway: standard(palette.walkway, 0.95),
    lines: new MeshBasicMaterial({ color: palette.marking }),
    foliage: new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
  };
  const ground = new Mesh(grass(), mats.grass);
  ground.position.set(-10, 0, 30);
  ground.receiveShadow = true;
  ground.name = 'ground';

  const r = roads();
  const meshes = [new Mesh(r.shoulder, mats.shoulder), new Mesh(r.asphalt, mats.asphalt), new Mesh(r.walkway, mats.walkway), new Mesh(r.lines, mats.lines), new Mesh(markings(), mats.lines)];
  for (const mesh of meshes) mesh.receiveShadow = true;

  const lotLayout = hub.buildings.find((x) => x.id === 'lot');
  if (lotLayout) {
    const lot = new Mesh(place(roundedBox(lotLayout.width, 0.05, lotLayout.depth, 0.02, 1), { x: lotLayout.x, y: 0.03, z: lotLayout.z }), mats.asphalt);
    lot.receiveShadow = true;
    group.add(lot);
  }

  const trees = plant();
  const sway = patchFoliageSway([mats.foliage]);
  group.add(
    ground,
    ...meshes,
    instanced(roundTree(), mats.foliage, trees.round),
    instanced(conifer(), mats.foliage, trees.conifer),
    instanced(palm(), mats.foliage, trees.palm),
    instanced(bush(), mats.foliage, trees.bush),
  );

  const baseAsphalt = new Color(palette.asphalt);
  const baseWalkway = new Color(palette.walkway);
  const wetTint = new Color('#16171C');
  let wet = 0;
  const apply = (): void => {
    mats.asphalt.color.copy(baseAsphalt).lerp(wetTint, 0.35 * wet);
    mats.asphalt.roughness = 0.95 - 0.55 * wet;
    mats.walkway.color.copy(baseWalkway).lerp(wetTint, 0.2 * wet);
    mats.shoulder.roughness = 0.95 - 0.4 * wet;
  };

  return {
    group,
    sway,
    setConditions(wetness) {
      wet = wetness;
      apply();
    },
    setPalette(p) {
      mats.grass.color.set(p.grass);
      baseAsphalt.set(p.asphalt);
      baseWalkway.set(p.walkway);
      mats.lines.color.set(p.marking);
      apply();
    },
  };
}
