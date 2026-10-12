import {
  BufferGeometry,
  Color,
  DoubleSide,
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
import { brand } from '../config/brand';
import type { Pose } from '../layout/positions';
import { sitePlan, type Boom, type PropKind } from '../layout/site';
import type { Vec2 } from '../sim/types';
import { vehicleAsset } from './assets/vehicles';
import { assemble, paint, place } from './kit/assemble';
import { cylinder, roundedBox, slab } from './kit/shapes';
import type { Palette } from './palette';
import { boomTarget, cctvPan, flagWave, patrolPose, siteDetail, type MovingVehicle } from './site/anim';
import { groundQuads, quadGeometry, signEntries, signQuads, type TextQuad } from './site/signs';
import { createTextAtlas } from './text/atlas';

// M5 site view (requirements §10, architecture §18): signs, entrance, perimeter, surveillance,
// ground details and the security patrol, all built from the pure site plan.

export interface SiteFrame {
  readonly dt: number;
  readonly wallTime: number;
  readonly night: number;
  readonly tier: number;
  readonly reducedMotion: boolean;
  /** Vehicles near the booms (interpolated positions). */
  readonly vehicles: readonly MovingVehicle[];
}

export interface SiteView {
  readonly group: Group;
  update(frame: SiteFrame): void;
  /** Boom arm openness, 0 down … 1 up. */
  boomOpen(id: Boom['id']): number;
  /** Patrol car position, or null while hidden (tier 2). */
  patrolPose(): Vec2 | null;
}

const GOLD = brand.colors.accent;
const GRAPHITE = '#2B2D35';
const STEEL = '#8A919C';
const CONCRETE = '#B8B6AE';
const UP = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const ONE = new Vector3(1, 1, 1);
const FENCE_H = 2.4;
const POST_STEP = 3;
const FLAG_W = 2.4;
const FLAG_H = 1.4;
const FLAG_POLE = 8;
const CCTV_H = 5.2;
const FLAG_HZ = 30;

/** Places a geometry at a pose (yaw from the heading, three's rotation convention). */
const at = (g: BufferGeometry, p: { x: number; z: number }, heading: number, y = 0): BufferGeometry => place(g, { x: p.x, y, z: p.z, rotY: -heading });

/** A board behind a vertical text quad: graphite face with a gold top edge. */
function boardFor(q: TextQuad): BufferGeometry[] {
  // right = (nz, 0, −nx) for a face with outward normal (nx, nz): the board sits behind the text.
  const nx = -q.right[2];
  const nz = q.right[0];
  const yaw = Math.atan2(nz, nx);
  const c = { x: q.c[0] - nx * 0.09, z: q.c[2] - nz * 0.09 };
  return [
    at(paint(slab(0.12, q.h + 0.45, q.w + 0.7), GRAPHITE), c, yaw, q.c[1]),
    at(paint(slab(0.14, 0.08, q.w + 0.7), GOLD), c, yaw, q.c[1] + q.h / 2 + 0.22),
  ];
}

function booth(p: Pose): BufferGeometry[] {
  return [
    at(paint(roundedBox(2.4, 0.25, 2.4, 0.08, 1), CONCRETE), p, p.heading, 0.12),
    at(paint(roundedBox(2.2, 2.3, 2.2, 0.12, 2), '#F1EFE8'), p, p.heading, 1.4),
    at(paint(slab(2.24, 0.9, 2.24), '#9CC7E3'), p, p.heading, 1.75),
    at(paint(roundedBox(2.7, 0.22, 2.7, 0.08, 1), GRAPHITE), p, p.heading, 2.66),
    at(paint(slab(2.5, 0.42, 2.5), GOLD), p, p.heading, 3.0),
  ];
}

function gantry(g: { x: number; z: number; heading: number; span: number; clearance: number }): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const lx = -Math.sin(g.heading);
  const lz = Math.cos(g.heading);
  for (const side of [1, -1]) {
    const leg = { x: g.x + lx * side * (g.span / 2), z: g.z + lz * side * (g.span / 2) };
    out.push(at(paint(cylinder(0.22, 0.26, g.clearance + 2.2, 10), STEEL), leg, g.heading, (g.clearance + 2.2) / 2));
  }
  out.push(at(paint(roundedBox(0.4, 0.4, g.span + 0.6, 0.1, 1), STEEL), g, g.heading, g.clearance + 2.0));
  return out;
}

function pylon(p: Pose): BufferGeometry[] {
  return [
    at(paint(roundedBox(3.4, 0.6, 1.6, 0.15, 1), CONCRETE), p, p.heading, 0.3),
    at(paint(roundedBox(2.6, 12, 0.8, 0.25, 2), GRAPHITE), p, p.heading, 6.6),
    at(paint(roundedBox(2.8, 0.5, 1.0, 0.15, 1), GOLD), p, p.heading, 12.7),
    at(paint(roundedBox(1.1, 1.1, 0.86, 0.2, 2), GOLD), p, p.heading, 11.4),
  ];
}

const PROP_GEOMETRY: Readonly<Record<PropKind, () => BufferGeometry>> = {
  barrier: () =>
    assemble([place(paint(roundedBox(3.0, 0.3, 0.6, 0.08, 1), CONCRETE), { y: 0.15 }), place(paint(roundedBox(3.0, 0.55, 0.26, 0.06, 1), CONCRETE), { y: 0.55 })]),
  planter: () =>
    assemble([
      place(paint(roundedBox(1.4, 0.6, 1.4, 0.15, 2), '#D9D2C3'), { y: 0.3 }),
      place(paint(roundedBox(1.15, 0.5, 1.15, 0.25, 2), '#4F8A3C'), { y: 0.8 }),
    ]),
  bench: () =>
    assemble([
      place(paint(roundedBox(1.8, 0.08, 0.5, 0.03, 1), '#9A6B3F'), { y: 0.46 }),
      place(paint(roundedBox(1.8, 0.4, 0.06, 0.03, 1), '#9A6B3F'), { y: 0.72, z: -0.22 }),
      place(paint(slab(0.08, 0.44, 0.44), GRAPHITE), { x: 0.75, y: 0.22 }),
      place(paint(slab(0.08, 0.44, 0.44), GRAPHITE), { x: -0.75, y: 0.22 }),
    ]),
  shelter: () =>
    assemble([
      place(paint(roundedBox(3.6, 0.12, 1.8, 0.05, 1), GRAPHITE), { y: 2.6 }),
      place(paint(slab(3.4, 2.4, 0.06), '#A9CFE6'), { y: 1.3, z: -0.8 }),
      place(paint(slab(0.1, 2.5, 0.1), STEEL), { x: 1.7, y: 1.25, z: -0.8 }),
      place(paint(slab(0.1, 2.5, 0.1), STEEL), { x: -1.7, y: 1.25, z: -0.8 }),
      place(paint(roundedBox(2.4, 0.08, 0.45, 0.03, 1), '#9A6B3F'), { y: 0.48, z: -0.5 }),
      place(paint(slab(0.12, 0.7, 0.9), GOLD), { x: 1.95, y: 2.1 }),
    ]),
  bin: () =>
    assemble([place(paint(cylinder(0.26, 0.22, 0.85, 10), '#3F6E4A'), { y: 0.43 }), place(paint(cylinder(0.29, 0.29, 0.08, 10), GRAPHITE), { y: 0.88 })]),
};

/** Fence posts and rails along each side, skipping the openings. */
function fenceParts(): { posts: Vec2[]; rails: BufferGeometry[]; fabric: BufferGeometry[] } {
  const { rect, openings } = sitePlan().fence;
  const posts: Vec2[] = [];
  const rails: BufferGeometry[] = [];
  const fabric: BufferGeometry[] = [];
  const sides: { side: 'west' | 'east' | 'north' | 'south'; from: Vec2; to: Vec2 }[] = [
    { side: 'south', from: { x: rect.minX, z: rect.minZ }, to: { x: rect.maxX, z: rect.minZ } },
    { side: 'east', from: { x: rect.maxX, z: rect.minZ }, to: { x: rect.maxX, z: rect.maxZ } },
    { side: 'north', from: { x: rect.maxX, z: rect.maxZ }, to: { x: rect.minX, z: rect.maxZ } },
    { side: 'west', from: { x: rect.minX, z: rect.maxZ }, to: { x: rect.minX, z: rect.minZ } },
  ];
  for (const s of sides) {
    const len = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z);
    const dx = (s.to.x - s.from.x) / len;
    const dz = (s.to.z - s.from.z) / len;
    const heading = Math.atan2(dz, dx);
    const along = (p: Vec2): number => (s.side === 'west' || s.side === 'east' ? p.z : p.x);
    const gaps = openings.filter((o) => o.side === s.side);
    const isGap = (p: Vec2): boolean => gaps.some((o) => along(p) > o.from && along(p) < o.to);
    // Runs of fence between gaps, each with posts, rails, barbed wire and fabric.
    let runStart: number | null = null;
    const closeRun = (end: number): void => {
      if (runStart === null || end - runStart < 0.5) return;
      const mid = (runStart + end) / 2;
      const c = { x: s.from.x + dx * mid, z: s.from.z + dz * mid };
      const w = end - runStart;
      rails.push(at(paint(slab(w, 0.06, 0.06), STEEL), c, heading, FENCE_H), at(paint(slab(w, 0.05, 0.05), STEEL), c, heading, 0.15));
      for (const [y, lean] of [[FENCE_H + 0.25, 0.12], [FENCE_H + 0.45, 0.24]] as const) {
        rails.push(at(paint(slab(w, 0.025, 0.025), '#6E737C'), { x: c.x - dz * lean, z: c.z + dx * lean }, heading, y));
      }
      fabric.push(at(new PlaneGeometry(w, FENCE_H - 0.2).translate(0, 0, 0), c, heading, FENCE_H / 2 + 0.05));
    };
    for (let t = 0; t <= len + 1e-6; t += POST_STEP) {
      const p = { x: s.from.x + dx * t, z: s.from.z + dz * t };
      if (isGap(p)) {
        closeRun(t - POST_STEP);
        runStart = null;
        continue;
      }
      posts.push(p);
      runStart ??= t;
    }
    closeRun(Math.floor(len / POST_STEP) * POST_STEP);
  }
  return { posts, rails, fabric };
}

/** One merged flag cloth per pole, as a grid we displace on the CPU. */
const FLAG_SEG_U = 8;
const FLAG_SEG_V = 4;

/** Builds the M5 site. */
export function createSiteView(palette: Palette): SiteView {
  const plan = sitePlan();
  const group = new Group();
  group.name = 'site';
  const standard = (opts: { transparent?: boolean; opacity?: number } = {}): MeshStandardMaterial =>
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, ...opts });

  // ---------- signs (G3) ----------
  const atlas = createTextAtlas(signEntries(plan));
  const layout = atlas?.layout ?? null;
  const quads = signQuads(plan, layout);
  const boards = assemble(quads.filter((q) => q.up[1] === 1).flatMap(boardFor));
  const signBoards = new Mesh(boards, standard());
  signBoards.castShadow = true;
  const textMat = new MeshBasicMaterial({ color: '#FFF4D6', transparent: true, alphaTest: 0.35, toneMapped: false, ...(atlas ? { map: atlas.texture } : { visible: false }) });
  const signText = new Mesh(quadGeometry(quads, layout), textMat);
  signText.renderOrder = 3;
  const groundMat = new MeshBasicMaterial({
    color: '#EDEDE6',
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    ...(atlas ? { map: atlas.texture } : { visible: false }),
  });
  const groundText = new Mesh(quadGeometry(groundQuads(plan, layout), layout), groundMat);
  groundText.renderOrder = 1;

  // ---------- static site (G4) ----------
  const fence = fenceParts();
  const staticParts: BufferGeometry[] = [
    ...plan.booths.flatMap((b) => booth(b.pose)),
    ...plan.gantries.flatMap(gantry),
    ...pylon(plan.pylon),
    ...plan.directionSigns.flatMap((s) => [at(paint(cylinder(0.07, 0.08, 2.4, 8), STEEL), s, s.heading, 1.2)]),
    ...plan.cctv.map((c) => at(paint(cylinder(0.09, 0.12, CCTV_H, 8), STEEL), c, 0, CCTV_H / 2)),
    ...plan.callBoxes.flatMap((c) => [
      at(paint(roundedBox(0.4, 1.5, 0.3, 0.08, 1), GOLD), c, c.heading, 0.75),
      at(paint(slab(0.3, 0.3, 0.32), GRAPHITE), c, c.heading, 1.1),
    ]),
    ...plan.bollards.map((b) => at(paint(cylinder(0.12, 0.12, 0.9, 8), GOLD), b, 0, 0.45)),
    ...plan.flags.map((f) => at(paint(cylinder(0.06, 0.08, FLAG_POLE, 8), '#E9EBEF'), f, 0, FLAG_POLE / 2)),
    ...plan.booths.map((b) => at(paint(cylinder(0.14, 0.14, 1.1, 8), '#E8E8E8'), b.boom.pivot, 0, 0.55)),
    ...fence.rails,
  ];
  const siteStatic = new Mesh(assemble(staticParts), standard());
  siteStatic.castShadow = true;
  siteStatic.receiveShadow = true;

  const clutter = new Mesh(assemble(plan.props.map((p) => at(PROP_GEOMETRY[p.kind](), p.pose, p.pose.heading))), standard());
  clutter.castShadow = true;
  clutter.receiveShadow = true;

  const posts = new InstancedMesh(paint(cylinder(0.05, 0.05, FENCE_H + 0.5, 6), STEEL), standard(), Math.max(1, fence.posts.length));
  const m = new Matrix4();
  const q = new Quaternion();
  const v = new Vector3();
  fence.posts.forEach((p, i) => {
    posts.setMatrixAt(i, m.compose(v.set(p.x, (FENCE_H + 0.5) / 2, p.z), q.identity(), ONE));
  });
  posts.count = fence.posts.length;
  const fabric = new Mesh(mergeGeometries(fence.fabric), new MeshStandardMaterial({ color: '#AAB2BC', transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false, roughness: 0.9 }));

  // ---------- animated pieces (G5) ----------
  const boomGeo = assemble([
    place(paint(slab(1, 0.12, 0.12), '#F4F4F2'), { x: 0.5 }),
    ...[0.15, 0.45, 0.75].map((x) => place(paint(slab(0.15, 0.13, 0.13), '#D8342A'), { x })),
  ]);
  const booms = new InstancedMesh(boomGeo, standard(), Math.max(1, plan.booths.length));
  const boomLift = plan.booths.map(() => 0);

  const headGeo = assemble([
    place(paint(roundedBox(0.55, 0.26, 0.3, 0.08, 1), '#E7E9ED'), { x: 0.2 }),
    place(paint(cylinder(0.08, 0.08, 0.06, 8), '#1E2128'), { x: 0.48, rotZ: Math.PI / 2 }),
  ]);
  const heads = new InstancedMesh(headGeo, standard(), Math.max(1, plan.cctv.length));
  const headBase = plan.cctv.map((c) => Math.atan2(35 - c.z, -c.x));

  // Flags: a displaced grid per pole, merged.
  const flagBase = new PlaneGeometry(FLAG_W, FLAG_H, FLAG_SEG_U, FLAG_SEG_V).translate(FLAG_W / 2, 0, 0);
  const flagGeos = plan.flags.map((f) => place(flagBase.clone(), { x: f.x, y: FLAG_POLE - FLAG_H / 2 - 0.2, z: f.z, rotY: -f.heading }));
  const flagGeo = mergeGeometries(flagGeos);
  const flagColours: number[] = [];
  const gold = new Color(GOLD);
  const white = new Color('#FFFFFF');
  const flagPos = flagGeo.getAttribute('position');
  const flagRest = Float32Array.from(flagPos.array);
  const per = flagBase.getAttribute('position').count;
  const flagUV: [number, number][] = [];
  for (let i = 0; i < flagPos.count; i++) {
    const k = i % per;
    const u = (flagBase.getAttribute('position').getX(k)) / FLAG_W;
    const vv = (flagBase.getAttribute('position').getY(k) + FLAG_H / 2) / FLAG_H;
    flagUV.push([u, vv]);
    const c = vv > 0.4 && vv < 0.6 ? white : gold;
    flagColours.push(c.r, c.g, c.b);
  }
  flagGeo.setAttribute('color', new Float32BufferAttribute(flagColours, 3));
  const flags = new Mesh(flagGeo, new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.8 }));
  flags.castShadow = true;
  let flagClock = 0;

  // Glow: call-box blue lights and the pylon crown, brighter at night (bloom).
  const glowGeo = assemble([
    ...plan.callBoxes.map((c) => at(paint(cylinder(0.09, 0.09, 0.14, 8), '#3D7BFF'), c, 0, 1.6)),
    at(paint(roundedBox(2.86, 0.14, 1.06, 0.05, 1), '#FFD98A'), plan.pylon, plan.pylon.heading, 12.4),
  ]);
  const glowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const glow = new Mesh(glowGeo, glowMat);

  // Patrol car (SEC-4): the SUV in security white with a light bar.
  const car = vehicleAsset('suv', palette);
  const patrol = new Group();
  patrol.add(new Mesh(car.paint, new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 })));
  patrol.add(new Mesh(car.trim, standard()));
  patrol.add(new Mesh(car.lamps, new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  const barMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const bar = new Mesh(
    assemble([place(paint(slab(0.3, 0.12, 0.6), '#FF3B30'), { y: 2.08, z: 0.32 }), place(paint(slab(0.3, 0.12, 0.6), '#2F6BFF'), { y: 2.08, z: -0.32 })]),
    barMat,
  );
  patrol.add(bar);
  for (const c of patrol.children) c.castShadow = true;
  let patrolVisible = true;
  let patrolAt: Vec2 = { x: 0, z: 0 };

  group.add(signBoards, signText, groundText, siteStatic, clutter, posts, fabric, booms, heads, flags, glow, patrol);

  const placeBooms = (): void => {
    plan.booths.forEach((b, i) => {
      // The arm reaches from the pivot across the lane (to the left of the traffic), lifting about the road axis.
      const across = b.boom.heading + Math.PI / 2;
      const yaw = new Quaternion().setFromAxisAngle(UP, -across);
      const lift = new Quaternion().setFromAxisAngle(Z_AXIS, (Math.PI / 2) * 0.95 * (boomLift[i] ?? 0));
      booms.setMatrixAt(i, m.compose(v.set(b.boom.pivot.x, 1.05, b.boom.pivot.z), yaw.multiply(lift), new Vector3(b.boom.length, 1, 1)));
    });
    booms.count = plan.booths.length;
    booms.instanceMatrix.needsUpdate = true;
  };
  placeBooms();

  return {
    group,
    update(frame) {
      const detail = siteDetail(frame.tier, frame.reducedMotion);
      clutter.visible = detail.clutter;

      // Booms ease towards their target.
      const ease = 1 - Math.exp(-frame.dt * 5);
      plan.booths.forEach((b, i) => {
        const target = boomTarget(frame.vehicles, b.boom) ? 1 : 0;
        boomLift[i] = (boomLift[i] ?? 0) + (target - (boomLift[i] ?? 0)) * ease;
      });
      placeBooms();

      plan.cctv.forEach((c, i) => {
        const yaw = (headBase[i] ?? 0) + cctvPan(frame.wallTime, i, detail.cctvMotion);
        heads.setMatrixAt(i, m.compose(v.set(c.x, CCTV_H + 0.05, c.z), q.setFromAxisAngle(UP, -yaw), ONE));
      });
      heads.count = plan.cctv.length;
      heads.instanceMatrix.needsUpdate = true;

      // Flags at ≤ 30 Hz.
      flagClock += frame.dt;
      if (flagClock >= 1 / FLAG_HZ) {
        flagClock = 0;
        const arr = flagPos.array as Float32Array;
        for (let i = 0; i < flagPos.count; i++) {
          const [u, vv] = flagUV[i] ?? [0, 0];
          const f = plan.flags[Math.floor(i / per)];
          const d = flagWave(frame.wallTime + Math.floor(i / per) * 0.7, u, vv, detail.flagRate);
          // Displace sideways to the flag (perpendicular to its heading).
          const nx = f ? -Math.sin(f.heading) : 0;
          const nz = f ? Math.cos(f.heading) : 0;
          arr[i * 3] = (flagRest[i * 3] ?? 0) + nx * d;
          arr[i * 3 + 2] = (flagRest[i * 3 + 2] ?? 0) + nz * d;
        }
        flagPos.needsUpdate = true;
      }

      const lit = 0.9 + 1.6 * frame.night;
      glowMat.color.setScalar(lit);
      textMat.color.set('#FFF4D6').multiplyScalar(0.95 + 0.95 * frame.night);

      patrolVisible = detail.patrol;
      patrol.visible = patrolVisible;
      if (patrolVisible) {
        const p = patrolPose(plan.patrolLoop, frame.wallTime);
        patrol.position.set(p.x, 0, p.z);
        patrol.rotation.set(0, -p.heading, 0);
        patrolAt = { x: p.x, z: p.z };
        const flash = !frame.reducedMotion && frame.night > 0.5 && Math.sin(frame.wallTime * 9) > 0;
        barMat.color.setScalar(frame.night > 0.5 ? (flash ? 2.2 : 0.4) : 0.55);
      }
    },
    boomOpen(id) {
      const i = plan.booths.findIndex((b) => b.boom.id === id);
      return i < 0 ? 0 : (boomLift[i] ?? 0);
    },
    patrolPose: () => (patrolVisible ? patrolAt : null),
  };
}
