import type { Edge } from '../sim/graph/laneGraph';
import type { Vec2 } from '../sim/types';
import { clearOfRoads, distanceToEdge, insideBuilding } from './geometry';
import { hub, hubGraph } from './hub';
import { lampPlacements } from './lamps';
import { hubBounds, type Bounds2D, type Pose } from './positions';

// The M5 site plan (requirements §10, architecture §18 G1): every placement around the hub,
// pure and deterministic. Render builds meshes from it; tests check its clearances.

export type Side = 'west' | 'east' | 'north' | 'south';

export interface FenceOpening {
  readonly side: Side;
  /** Along the side: z for west/east, x for north/south. */
  readonly from: number;
  readonly to: number;
}

/** A visual road continuing west of the hub to the edge of the grass ("Airport Blvd" approaches). */
export interface RoadExtension {
  readonly z: number;
  readonly width: number;
  readonly fromX: number;
  readonly toX: number;
}

export interface Gantry {
  /** Centre of the span, over the road's centre line. */
  readonly x: number;
  readonly z: number;
  /** Road direction under the gantry (radians). */
  readonly heading: number;
  /** Clear span between the two legs. */
  readonly span: number;
  /** Height of the sign's underside above the road. */
  readonly clearance: number;
  readonly text: string;
}

export interface DirectionSign {
  readonly x: number;
  readonly z: number;
  /** Direction the sign face looks (towards approaching traffic). */
  readonly heading: number;
  readonly lines: readonly string[];
}

export interface GroundText {
  readonly x: number;
  readonly z: number;
  /** Driving direction: the text reads from this way. */
  readonly heading: number;
  readonly text: 'RETURN' | 'SLOW';
}

export interface Boom {
  readonly id: 'entry' | 'exit';
  /** Pivot of the arm, beside the road. */
  readonly pivot: Vec2;
  /** Road direction the boom guards (radians). */
  readonly heading: number;
  /** Arm length: reaches across the lane. */
  readonly length: number;
}

export interface Booth {
  readonly pose: Pose;
  readonly boom: Boom;
}

export type PropKind = 'barrier' | 'planter' | 'bench' | 'shelter' | 'bin';

export interface Prop {
  readonly kind: PropKind;
  readonly pose: Pose;
}

export interface SitePlan {
  readonly fence: { readonly rect: Bounds2D; readonly openings: readonly FenceOpening[] };
  readonly roadExtensions: readonly RoadExtension[];
  /** Closed loop (the last point joins the first), outside the fence. */
  readonly patrolLoop: readonly Vec2[];
  readonly gantries: readonly Gantry[];
  readonly directionSigns: readonly DirectionSign[];
  readonly groundText: readonly GroundText[];
  readonly pylon: Pose;
  readonly flags: readonly Pose[];
  readonly booths: readonly Booth[];
  readonly cctv: readonly Pose[];
  readonly callBoxes: readonly Pose[];
  readonly bollards: readonly Vec2[];
  readonly props: readonly Prop[];
}

/** Fence distance outside the hub's roads (G1). */
export const FENCE_MARGIN = 14;
/** Patrol loop distance outside the hub's roads. */
export const PATROL_MARGIN = 26;
export const GANTRY_CLEARANCE = 5.5;

/** West edge of the grass (landscape plane), where the road extensions start. */
const GROUND_WEST = -650;
const OPENING_PAD = 3;
const PATROL_CORNER = 12;
/** Clearances for placed items (P4 rules). */
const ROAD_CLEARANCE = 0.8;
const LAMP_GAP = 2;
const ITEM_GAP = 1.6;

let cached: SitePlan | null = null;

const poseOnEdge = (e: Edge, s: number): Pose => {
  const p = e.path.pointAt(Math.min(e.length, Math.max(0, s)));
  return { x: p.x, z: p.z, heading: e.path.headingAt(Math.min(e.length, Math.max(0, s))) };
};

/** A point `side` metres to the left (+) or right (−) of a pose. */
const beside = (p: Pose, side: number, ahead = 0): Vec2 => ({
  x: p.x + Math.cos(p.heading) * ahead - Math.sin(p.heading) * side,
  z: p.z + Math.sin(p.heading) * ahead + Math.cos(p.heading) * side,
});

/** Rounded rectangle as a closed polyline (corners of radius r, 4 points each). */
function roundedLoop(b: Bounds2D, r: number): Vec2[] {
  const out: Vec2[] = [];
  const corners: [number, number, number][] = [
    [b.maxX - r, b.minZ + r, -Math.PI / 2],
    [b.maxX - r, b.maxZ - r, 0],
    [b.minX + r, b.maxZ - r, Math.PI / 2],
    [b.minX + r, b.minZ + r, Math.PI],
  ];
  for (const [cx, cz, start] of corners) {
    for (let k = 0; k <= 3; k++) {
      const a = start + (k / 3) * (Math.PI / 2);
      out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
  }
  return out;
}

/** The site plan, computed once and cached. */
export function sitePlan(): SitePlan {
  if (cached) return cached;
  const graph = hubGraph();
  const lamps = lampPlacements();
  const rect = hubBounds(FENCE_MARGIN);
  const entry = graph.edge(hub.entryEdge);
  const exit = graph.edge(hub.exitEdge);
  const vehicle = graph.edges.filter((e) => !e.kinds?.includes('pedestrian'));

  // Public roads leave the hub to the west: the entry's first point and the exit's last point.
  const entryStart = entry.path.points[0] as Vec2;
  const exitEnd = exit.path.points[exit.path.points.length - 1] as Vec2;
  const roadExtensions: RoadExtension[] = [entryStart, exitEnd].map((p, i) => ({
    z: p.z,
    width: (i === 0 ? entry : exit).width,
    fromX: GROUND_WEST,
    toX: p.x,
  }));
  const openings: FenceOpening[] = roadExtensions.map((r) => ({ side: 'west', from: r.z - r.width / 2 - OPENING_PAD, to: r.z + r.width / 2 + OPENING_PAD }));

  // ---------- generic placement with the P4 clearance rules ----------

  const taken: Vec2[] = [];
  const insideFence = (p: Vec2): boolean => p.x > rect.minX + 1 && p.x < rect.maxX - 1 && p.z > rect.minZ + 1 && p.z < rect.maxZ - 1;
  const ok = (p: Vec2, radius: number, spaced: boolean, fenced: boolean): boolean =>
    clearOfRoads(p, ROAD_CLEARANCE + radius) &&
    !insideBuilding(p, 0.3) &&
    lamps.every((l) => Math.hypot(l.x - p.x, l.z - p.z) >= LAMP_GAP) &&
    (!spaced || taken.every((t) => Math.hypot(t.x - p.x, t.z - p.z) >= ITEM_GAP + radius)) &&
    (!fenced || insideFence(p));
  /** Searches outwards from `near` in a deterministic spiral; null if nothing fits within 20 m. */
  const find = (near: Vec2, radius = 0.5, spaced = true, fenced = true): Vec2 | null => {
    if (ok(near, radius, spaced, fenced)) return near;
    for (let ring = 1; ring <= 20; ring++) {
      const steps = 8 * ring;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const p = { x: near.x + Math.cos(a) * ring, z: near.z + Math.sin(a) * ring };
        if (ok(p, radius, spaced, fenced)) return p;
      }
    }
    return null;
  };
  /** Places an item near `near` and reserves its spot so later items keep their distance. */
  const placeNear = (near: Vec2, heading: number, radius = 0.5, fenced = true): Pose | null => {
    const p = find(near, radius, true, fenced);
    if (!p) return null;
    taken.push(p);
    return { x: p.x, z: p.z, heading };
  };

  // ---------- entrance: booths, gantries, pylon, flags (B-2, B-3, SEC-2) ----------

  const booths: Booth[] = [];
  const boothFor = (id: Boom['id'], e: Edge, s: number): void => {
    const at = poseOnEdge(e, s);
    const side = -(e.width / 2 + 0.9); // right-hand side of the traffic
    const pivot = beside(at, side);
    const booth = placeNear(beside(at, side - 2.2), at.heading, 1.2);
    if (booth) booths.push({ pose: booth, boom: { id, pivot, heading: at.heading, length: e.width + 1.2 } });
  };
  boothFor('entry', entry, 12);
  boothFor('exit', exit, exit.length - 14);

  const gantries: Gantry[] = [
    { e: entry, s: 32, text: 'Rental Car Return →' },
    { e: exit, s: exit.length - 34, text: 'Airport Terminals ↑ · Exit to Airport Blvd' },
  ].map(({ e, s, text }) => {
    const at = poseOnEdge(e, s);
    return { x: at.x, z: at.z, heading: at.heading, span: e.width + 3.5, clearance: GANTRY_CLEARANCE + 0.5, text };
  });
  // Keep other items off the gantry legs.
  for (const g of gantries) for (const side of [1, -1]) taken.push(beside(g, side * (g.span / 2)));

  const entryPose = poseOnEdge(entry, 0);
  const pylon = placeNear(beside(entryPose, entry.width / 2 + 9, 4), entryPose.heading, 1.5, false) ?? { ...entryPose, z: entryPose.z + 10 };
  const flags: Pose[] = [];
  for (let k = 0; flags.length < 6 && k < 30; k++) {
    const f = placeNear(beside(entryPose, -(entry.width / 2 + 5), 6 + k * 5), entryPose.heading, 0.4, false);
    if (f) flags.push(f);
  }

  // ---------- wayfinding (B-3) ----------

  const directionSigns: DirectionSign[] = [];
  const signFor = (station: 'wash' | 'service' | 'charger' | 'slot' | 'gate', name: string): void => {
    const q = graph.edge(hub.stations[station].queueEdge as string);
    const at = poseOnEdge(q, 2);
    const p = find(beside(at, -(q.width / 2 + 2.5), -6), 0.6);
    if (p) {
      taken.push(p);
      directionSigns.push({ x: p.x, z: p.z, heading: at.heading + Math.PI, lines: [name] });
    }
  };
  signFor('wash', 'Wash ↑');
  signFor('service', 'Service ↑');
  signFor('charger', 'EV Charging & Fuel ↑');
  signFor('slot', 'Ready Lot ↑');
  signFor('gate', 'Exit ↑');

  const groundText: GroundText[] = [];
  const ret = poseOnEdge(entry, 48);
  groundText.push({ x: ret.x, z: ret.z, heading: ret.heading, text: 'RETURN' });
  // SLOW before each pedestrian crossing: where a walkway meets a vehicle road.
  for (const walk of graph.edges.filter((e) => e.kinds?.includes('pedestrian'))) {
    for (const road of vehicle) {
      let crossS: number | null = null;
      for (let s = 0; s <= road.length && crossS === null; s += 0.5) {
        if (distanceToEdge(road.path.pointAt(s), walk) < walk.width / 2) crossS = s;
      }
      if (crossS !== null && crossS > 10 && groundText.length < 4) {
        const at = poseOnEdge(road, crossS - 8);
        groundText.push({ x: at.x, z: at.z, heading: at.heading, text: 'SLOW' });
      }
    }
  }

  // ---------- surveillance and safety (SEC-3) ----------

  const lot = hub.buildings.find((b) => b.id === 'lot');
  const building = (id: string) => hub.buildings.find((b) => b.id === id);
  const cctvAnchors: Vec2[] = [
    beside(entryPose, entry.width / 2 + 5, 16),
    poseOnEdge(exit, exit.length - 20),
  ];
  if (lot) {
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) cctvAnchors.push({ x: lot.x + fx * (lot.width / 2 - 2), z: lot.z + fz * (lot.depth / 2 + 7) });
  }
  for (const id of ['canopy', 'wash', 'service', 'evHub']) {
    const b = building(id);
    if (b) cctvAnchors.push({ x: b.x, z: b.z + b.depth / 2 + 4 });
  }
  const cctv: Pose[] = [];
  for (const a of cctvAnchors) {
    const p = placeNear(a, 0, 0.4);
    if (p) cctv.push(p);
  }

  const callBoxes: Pose[] = [];
  for (const walk of graph.edges.filter((e) => e.kinds?.includes('pedestrian'))) {
    const at = poseOnEdge(walk, walk.length / 2);
    const p = placeNear(beside(at, walk.width / 2 + 1.2), at.heading, 0.4);
    if (p) callBoxes.push(p);
  }

  const bollards: Vec2[] = [];
  const terminal = building('terminal');
  if (terminal) {
    // A row along the terminal frontage (east face), then the walkway door.
    for (let k = 0; k < 8; k++) {
      const p = find({ x: terminal.x + terminal.width / 2 + 2.2, z: terminal.z - 14 + k * 4 }, 0.15, false);
      if (p) bollards.push(p);
    }
  }
  for (const walk of graph.edges.filter((e) => e.kinds?.includes('pedestrian'))) {
    const at = poseOnEdge(walk, 0);
    for (const side of [1, -1]) {
      const p = find(beside(at, side * (walk.width / 2 + 0.9), 1), 0.15, false);
      if (p) bollards.push(p);
    }
  }

  // ---------- ground details (ENV-1) ----------

  const props: Prop[] = [];
  const prop = (kind: PropKind, near: Vec2, heading: number, radius: number): void => {
    const p = placeNear(near, heading, radius);
    if (p) props.push({ kind, pose: p });
  };
  for (let k = 0; k < 5; k++) prop('barrier', beside(poseOnEdge(entry, 20 + k * 6), entry.width / 2 + 2.4), entryPose.heading, 1.2);
  if (terminal) {
    for (let k = 0; k < 3; k++) prop('planter', { x: terminal.x + terminal.width / 2 + 5, z: terminal.z - 10 + k * 10 }, 0, 0.8);
    for (let k = 0; k < 2; k++) prop('bench', { x: terminal.x + terminal.width / 2 + 5, z: terminal.z - 5 + k * 10 }, Math.PI / 2, 0.9);
  }
  const stop = graph.edge(hub.shuttle.stopEdge);
  const stopAt = poseOnEdge(stop, stop.length / 2);
  prop('shelter', beside(stopAt, stop.width / 2 + 3), stopAt.heading, 1.6);
  prop('bin', beside(stopAt, stop.width / 2 + 3, 5), 0, 0.3);
  if (terminal) prop('bin', { x: terminal.x + terminal.width / 2 + 4, z: terminal.z + 16 }, 0, 0.3);
  if (lot) prop('bin', { x: lot.x - lot.width / 2 - 3, z: lot.z }, 0, 0.3);

  cached = {
    fence: { rect, openings },
    roadExtensions,
    patrolLoop: roundedLoop(hubBounds(PATROL_MARGIN), PATROL_CORNER),
    gantries,
    directionSigns,
    groundText,
    pylon,
    flags,
    booths,
    cctv,
    callBoxes,
    bollards,
    props,
  };
  return cached;
}
