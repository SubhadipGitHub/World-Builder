import {
  type BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { createFlightSchedule, type AircraftPose, type FlightSchedule } from '../../airport/flights';
import { airportPlan, type AirportPlan } from '../../airport/plan';
import { airportDetail, serviceVehiclesAt, trafficAt } from '../../airport/traffic';
import { vehicleAsset } from '../assets/vehicles';
import { assemble, paint, place } from '../kit/assemble';
import { blob, cylinder, roundedBox, slab } from '../kit/shapes';
import type { Palette } from '../palette';
import { at, boardFor, CONCRETE, gantry, GOLD, GRAPHITE, STEEL } from '../site';
import { quadGeometry, textWidth, type TextQuad } from '../site/signs';
import type { AtlasEntry, TextAtlas } from '../text/atlas';
import { AIRLINE_COLOUR, jetParts } from './aircraft';

// M6 airport view (requirements §11, architecture §19 H9–H13): the static airport merged by
// material, plus instanced jets, jet bridges, airfield lights, traffic and airport vehicles.

export interface AirportFrame {
  /** Airport clock (H2). */
  readonly time: number;
  readonly night: number;
  readonly tier: number;
  readonly reducedMotion: boolean;
  /** Mean street-lamp level (0 … 1): airfield lights switch with the street lights. */
  readonly lampLevel: number;
}

export interface AirportView {
  readonly group: Group;
  update(frame: AirportFrame): void;
  /** Aircraft as rendered in the last update (parked only on tier 2). */
  aircraft(): readonly AircraftPose[];
  /** Schedules the surge's extra arrival (F-2) at the current airport time. */
  surge(): void;
  /** Airport seconds until the next touchdown, from the last update (M8 kiosk fact). */
  nextLandingSec(): number | null;
}

const UP = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const ONE = new Vector3(1, 1, 1);
const ZERO = new Vector3(0, 0, 0);
const JET_CAPACITY = 16;
const TERMINAL_COLOUR = '#E9E6DF';
/** Light membrane roofs: graphite roofs read as black voids from the high camera. */
const ROOF = '#CDD1D8';
const GLASS = '#8FB8D6';
const ASPHALT = '#3C3F47';
const TAXI_ASPHALT = '#4A4D55';
const APRON = '#BDBDB8';
const MARK_WHITE = '#F2F2EE';
const MARK_YELLOW = '#F2C230';
const LIGHT_COLOUR: Readonly<Record<'white' | 'green' | 'red' | 'blue', string>> = { white: '#FFF4D6', green: '#3BFF6E', red: '#FF3B30', blue: '#3D7BFF' };

/** Vertical text quad helper: outward normal (nx, nz), centre and letter height. */
const vertical = (text: string, x: number, y: number, z: number, nx: number, nz: number, letter: number, atlas: TextAtlas | null): TextQuad => ({
  c: [x + nx * 0.2, y, z + nz * 0.2],
  right: [nz, 0, -nx],
  up: [0, 1, 0],
  w: textWidth(atlas?.layout ?? null, text, letter),
  h: letter * 1.25,
  text,
});

/** Flat road text reading in direction `heading`. */
const flat = (text: string, x: number, z: number, heading: number, w: number, h: number): TextQuad => {
  const fx = Math.cos(heading);
  const fz = Math.sin(heading);
  return { c: [x, 0.09, z], right: [-fz, 0, fx], up: [fx, 0, fz], w, h, text };
};

/** Every string the airport draws, for the shared atlas (H7). */
export function airportTexts(plan: AirportPlan = airportPlan()): readonly AtlasEntry[] {
  const texts = ['Pacific Gateway International', 'Gateway Hotel', 'Parking', 'P', 'Sunline Cargo', 'Fire Station', 'Fuel Farm', 'Cell Phone Lot', '09', '27', ...plan.gates.map((g) => g.id), ...plan.gantries.map((g) => g.text)];
  return texts.map((text) => ({ text, px: 72 }));
}

function signQuads(plan: AirportPlan, atlas: TextAtlas | null): { vertical: TextQuad[]; ground: TextQuad[] } {
  const t = plan.terminal;
  const b = (id: string) => plan.buildings.find((x) => x.id === id);
  const out: TextQuad[] = [vertical('Pacific Gateway International', t.x, t.height + 4, t.z - t.depth / 2, 0, -1, 3, atlas)];
  for (const g of plan.gates) out.push(vertical(g.id, g.stand.x, 14, t.z + t.depth / 2, 0, 1, 1.6, atlas));
  const hotel = b('hotel');
  if (hotel) out.push(vertical('Gateway Hotel', hotel.x + hotel.width / 2, hotel.height - 2, hotel.z, 1, 0, 2, atlas));
  const garage = b('garage');
  if (garage) out.push(vertical('Parking', garage.x + garage.width / 2, garage.height - 2, garage.z, 1, 0, 2, atlas));
  const cargo = b('cargo');
  if (cargo) out.push(vertical('Sunline Cargo', cargo.x, cargo.height - 3, cargo.z + cargo.depth / 2, 0, 1, 2, atlas));
  const fire = b('fire');
  if (fire) out.push(vertical('Fire Station', fire.x, fire.height - 1.5, fire.z + fire.depth / 2, 0, 1, 1.2, atlas));
  const fuel = b('fuel');
  if (fuel) out.push(vertical('Fuel Farm', fuel.x, 3.2, fuel.z - fuel.depth / 2 - 0.5, 0, -1, 1, atlas));
  const cell = b('cellLot');
  if (cell) out.push(vertical('Cell Phone Lot', cell.x + cell.width / 2 + 3, 3.2, cell.z, 0, 1, 0.9, atlas));
  for (const g of plan.gantries) {
    const nx = -Math.cos(g.heading);
    const nz = -Math.sin(g.heading);
    const q = vertical(g.text, g.x, plan.boulevard.deckY + g.clearance + 1.1, g.z, nx, nz, 0.8, atlas);
    out.push({ ...q, w: Math.min(q.w, g.span + 6) });
  }
  const r = plan.runway;
  const ground = [flat('27', r.toX - 70, r.z, Math.PI, 14, 22), flat('09', r.fromX + 70, r.z, 0, 14, 22)];
  return { vertical: out, ground };
}

function staticParts(plan: AirportPlan): { solid: BufferGeometry[]; glass: BufferGeometry[]; glow: BufferGeometry[] } {
  const solid: BufferGeometry[] = [];
  const glass: BufferGeometry[] = [];
  const glow: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, colour: string, x: number, y: number, z: number, r = 0.2): BufferGeometry => place(paint(roundedBox(w, h, d, r, 1), colour), { x, y, z });
  const t = plan.terminal;
  // Terminal: body, roof, glass curtain walls, curb canopy with columns.
  solid.push(box(t.width, t.height, t.depth, TERMINAL_COLOUR, t.x, t.height / 2, t.z, 0.6), box(t.width + 2, 0.8, t.depth + 2, ROOF, t.x, t.height + 0.4, t.z, 0.3));
  glass.push(place(paint(slab(t.width - 6, t.height - 5, 0.3), GLASS), { x: t.x, y: t.height / 2 + 1, z: t.z - t.depth / 2 - 0.1 }), place(paint(slab(t.width - 6, 8, 0.3), GLASS), { x: t.x, y: 9, z: t.z + t.depth / 2 + 0.1 }));
  solid.push(box(t.width, 0.6, 9, GRAPHITE, t.x, 7.5, t.z - t.depth / 2 - 4.5, 0.2));
  for (let x = -140; x <= 140; x += 35) solid.push(place(paint(cylinder(0.35, 0.35, 7.2, 8), STEEL), { x, y: 3.6, z: t.z - t.depth / 2 - 8.5 }));
  glow.push(place(paint(slab(t.width - 10, 0.5, 0.2), '#FFD98A'), { x: t.x, y: t.height - 2, z: t.z - t.depth / 2 - 0.3 }));
  // Jet bridge rotundas.
  for (const g of plan.gates) solid.push(place(paint(cylinder(1.8, 1.8, 5.5, 12), '#D9DCE1'), { x: g.stand.x + 4, y: 2.75, z: t.z + t.depth / 2 + 4 }));

  for (const b of plan.buildings) {
    switch (b.id) {
      case 'tower':
        solid.push(place(paint(cylinder(2.4, 3.6, b.height - 8, 14), '#E3E1DA'), { x: b.x, y: (b.height - 8) / 2, z: b.z }));
        glass.push(place(paint(cylinder(5.2, 4.4, 5, 16), GLASS), { x: b.x, y: b.height - 5.5, z: b.z }));
        solid.push(place(paint(cylinder(5.6, 5.6, 0.6, 16), GOLD), { x: b.x, y: b.height - 8.2, z: b.z }), place(paint(cylinder(5.8, 5.8, 0.8, 16), GRAPHITE), { x: b.x, y: b.height - 2.6, z: b.z }));
        break;
      case 'fire':
        solid.push(box(b.width, b.height, b.depth, '#B8483B', b.x, b.height / 2, b.z, 0.3), box(4, 15, 4, '#B8483B', b.x + b.width / 2 - 3, 7.5, b.z - b.depth / 2 + 3, 0.2));
        for (const dx of [-12, 0, 12]) solid.push(place(paint(slab(9, 6, 0.2), '#F1EFE8'), { x: b.x + dx, y: 3.2, z: b.z + b.depth / 2 + 0.1 }));
        // Airport fire engine on the apron in front.
        solid.push(box(10, 3.2, 3.2, '#D8342A', b.x - 6, 1.9, b.z + b.depth / 2 + 7, 0.5), box(3, 0.5, 3.3, '#F4F4F2', b.x - 9, 2.2, b.z + b.depth / 2 + 7, 0.1));
        break;
      case 'fuel':
        for (const [dx, dz] of [[-15, -9], [15, -9], [-15, 9], [15, 9]] as const) solid.push(place(paint(cylinder(7, 7, b.height - 2, 18), '#F4F4F2'), { x: b.x + dx, y: (b.height - 2) / 2, z: b.z + dz }));
        for (const [w, d, dx, dz] of [[b.width, 0.6, 0, -b.depth / 2], [b.width, 0.6, 0, b.depth / 2], [0.6, b.depth, -b.width / 2, 0], [0.6, b.depth, b.width / 2, 0]] as const) solid.push(box(w, 1.6, d, CONCRETE, b.x + dx, 0.8, b.z + dz, 0.1));
        break;
      case 'cargo':
        solid.push(box(b.width, b.height, b.depth, '#C9CED6', b.x, b.height / 2, b.z, 0.4));
        for (const dx of [-24, -8, 8, 24]) solid.push(place(paint(slab(10, 7, 0.2), '#8C939E'), { x: b.x + dx, y: 3.6, z: b.z + b.depth / 2 + 0.1 }));
        break;
      case 'garage':
        for (let lv = 0; lv < 5; lv++) {
          solid.push(box(b.width, 0.6, b.depth, CONCRETE, b.x, lv * 3 + 0.3, b.z, 0.1));
          glow.push(place(paint(slab(b.width, 0.15, 0.2), '#FFE7B0'), { x: b.x, y: lv * 3 + 2.6, z: b.z - b.depth / 2 }), place(paint(slab(0.2, 0.15, b.depth), '#FFE7B0'), { x: b.x + b.width / 2, y: lv * 3 + 2.6, z: b.z }));
          if (lv > 0) {
            for (let r = 0; r < 2; r++) {
              for (let k = 0; k < 10; k++) {
                const colour = ['#C7CCD4', '#2E3440', '#8A1F2B', '#E8E8E8', '#3B5B8C'][(k + r + lv) % 5] ?? '#C7CCD4';
                solid.push(place(paint(slab(4.4, 1.3, 1.9), colour), { x: b.x - 28 + k * 6.2, y: lv * 3 + 1.25, z: b.z + (r === 0 ? -14 : 14) }));
              }
            }
          }
        }
        for (const dx of [-30, 0, 30]) for (const dz of [-40, 0, 40]) solid.push(place(paint(cylinder(0.5, 0.5, 15, 8), CONCRETE), { x: b.x + dx, y: 7.5, z: b.z + dz }));
        solid.push(box(b.width + 2, 1, b.depth + 2, ROOF, b.x, b.height, b.z, 0.2));
        break;
      case 'hotel':
        solid.push(box(b.width, b.height, b.depth, '#D9D3C7', b.x, b.height / 2, b.z, 0.5), box(b.width + 20, 6, b.depth + 10, '#CFC8BA', b.x, 3, b.z, 0.4));
        for (let fl = 1; fl < 11; fl++) {
          const y = 6 + fl * 3.2;
          for (const [w, d, dx, dz] of [[b.width - 4, 0.15, 0, -b.depth / 2 - 0.05], [b.width - 4, 0.15, 0, b.depth / 2 + 0.05], [0.15, b.depth - 4, -b.width / 2 - 0.05, 0], [0.15, b.depth - 4, b.width / 2 + 0.05, 0]] as const) {
            glow.push(place(paint(slab(w, 1.1, d), '#FFE2A6'), { x: b.x + dx, y, z: b.z + dz }));
          }
        }
        break;
      case 'cellLot':
        solid.push(place(paint(roundedBox(6, 0.15, 3, 0.05, 1), GRAPHITE), { x: b.x + b.width / 2 - 6, y: 3, z: b.z + b.depth / 2 - 2 }));
        for (const dx of [-2.5, 2.5]) solid.push(place(paint(cylinder(0.08, 0.08, 3, 6), STEEL), { x: b.x + b.width / 2 - 6 + dx, y: 1.5, z: b.z + b.depth / 2 - 2 }));
        solid.push(place(paint(cylinder(0.08, 0.08, 3.4, 6), STEEL), { x: b.x + b.width / 2 + 3, y: 1.6, z: b.z }));
        break;
    }
  }

  // Boulevard: deck on piers (clear of the hub road extensions), then a ramp down to the curb.
  const blvd = plan.boulevard;
  const deckEnd = 200;
  const deckLen = deckEnd - blvd.fromZ;
  solid.push(box(blvd.width, 1, deckLen, '#C3C1BA', blvd.x, blvd.deckY - 0.5, blvd.fromZ + deckLen / 2, 0.1));
  for (const side of [1, -1]) solid.push(box(0.5, 1, deckLen, CONCRETE, blvd.x + side * (blvd.width / 2 - 0.25), blvd.deckY + 0.5, blvd.fromZ + deckLen / 2, 0.1));
  for (let z = blvd.fromZ + 15; z < deckEnd; z += 35) {
    if (plan.overpasses.some((o) => Math.abs(o.z - z) < 10)) continue;
    solid.push(place(paint(cylinder(1.3, 1.5, blvd.deckY - 1, 10), CONCRETE), { x: blvd.x, y: (blvd.deckY - 1) / 2, z }));
  }
  const rampLen = blvd.toZ - deckEnd;
  solid.push(place(paint(slab(blvd.width, 1, Math.hypot(rampLen, blvd.deckY)), '#C3C1BA'), { x: blvd.x, y: blvd.deckY / 2 - 0.5, z: deckEnd + rampLen / 2, rotX: Math.atan2(blvd.deckY, rampLen) }));
  for (const g of plan.gantries) solid.push(...gantry({ ...g, clearance: g.clearance }).map((p) => p.translate(0, blvd.deckY, 0)));

  // Airside fence: posts and rails, open where the boulevard and the airside gate cross it.
  const f = plan.airsideFence;
  const openings = [
    [blvd.x - 18, blvd.x + 18],
    [f.gate.x - 6, f.gate.x + 6],
  ] as const;
  let runStart: number | null = null;
  const closeRun = (end: number): void => {
    if (runStart === null || end - runStart < 1) return;
    const w = end - runStart;
    for (const y of [2.4, 0.15, 2.7, 2.9]) solid.push(place(paint(slab(w, 0.05, 0.05), y > 2.5 ? '#6E737C' : STEEL), { x: runStart + w / 2, y, z: f.z }));
  };
  for (let x = f.fromX; x <= f.toX; x += 3) {
    if (openings.some(([a, b]) => x > a && x < b)) {
      closeRun(x - 3);
      runStart = null;
      continue;
    }
    solid.push(place(paint(cylinder(0.05, 0.05, 2.9, 5), STEEL), { x, y: 1.45, z: f.z }));
    runStart ??= x;
  }
  closeRun(f.toX);
  // Airside gate booth with its boom held up (SEC-2 style).
  solid.push(...[
    at(paint(roundedBox(2.2, 2.3, 2.2, 0.12, 2), '#F1EFE8'), { x: f.gate.x + 8, z: f.z - 3 }, 0, 1.4),
    at(paint(slab(2.5, 0.42, 2.5), GOLD), { x: f.gate.x + 8, z: f.z - 3 }, 0, 2.9),
    at(paint(slab(0.12, 4.2, 0.12), '#F4F4F2'), { x: f.gate.x + 6.5, z: f.z }, 0, 3.1),
  ]);
  return { solid, glass, glow };
}

function pavementParts(plan: AirportPlan): { surface: BufferGeometry[]; marks: BufferGeometry[] } {
  const surface: BufferGeometry[] = [];
  const marks: BufferGeometry[] = [];
  const pad = (w: number, d: number, colour: string, x: number, z: number, y = 0.02, yaw = 0): BufferGeometry => place(paint(slab(w, 0.04, d), colour), { x, y, z, rotY: yaw });
  const r = plan.runway;
  const tw = plan.taxiway;
  surface.push(pad(r.toX - r.fromX + 40, r.width, ASPHALT, (r.fromX + r.toX) / 2, r.z, 0.03));
  surface.push(pad(tw.toX - tw.fromX, tw.width, TAXI_ASPHALT, (tw.fromX + tw.toX) / 2, tw.z, 0.025));
  const a = plan.apron;
  surface.push(pad(a.maxX - a.minX, a.maxZ - a.minZ, APRON, (a.minX + a.maxX) / 2, (a.minZ + a.maxZ) / 2));
  // West apron (cargo and remote stands) and the lane extension to it.
  surface.push(pad(170, 98, APRON, -380, (a.minZ + a.maxZ) / 2));
  // Connectors: taxiway ↔ apron at every gate column, the runway's east end, and the west exit.
  for (const g of plan.gates) surface.push(pad(18, tw.z - a.maxZ + 4, TAXI_ASPHALT, g.stand.x, (tw.z + a.maxZ) / 2, 0.022));
  surface.push(pad(40, r.z - tw.z, TAXI_ASPHALT, tw.toX + 15, (r.z + tw.z) / 2, 0.022));
  const exit = plan.rapidExit;
  for (let i = 1; i < exit.length; i++) {
    const p = exit[i - 1];
    const q = exit[i];
    if (!p || !q) continue;
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    surface.push(pad(len + 10, 22, TAXI_ASPHALT, (p.x + q.x) / 2, (p.z + q.z) / 2, 0.022, -Math.atan2(q.z - p.z, q.x - p.x)));
  }
  // Curb road, boulevard approach and cell-phone lot.
  const c = plan.curb;
  surface.push(pad(c.toX - plan.boulevard.x + 30, 22, ASPHALT, (plan.boulevard.x + c.toX + 30) / 2, c.z, 0.03));
  const cell = plan.buildings.find((b) => b.id === 'cellLot');
  if (cell) {
    surface.push(pad(cell.width, cell.depth, ASPHALT, cell.x, cell.z, 0.03));
    for (let k = 0; k < 13; k++) marks.push(pad(0.15, 5, MARK_WHITE, cell.x - cell.width / 2 + 5 + k * 5, cell.z - cell.depth / 2 + 4, 0.06));
  }
  // Runway markings: centreline dashes, piano keys at both thresholds, touchdown bars.
  for (let x = r.fromX + 60; x < r.toX - 60; x += 50) marks.push(pad(30, 0.9, MARK_WHITE, x, r.z, 0.06));
  for (const end of [r.fromX + 12, r.toX - 12]) for (let k = -7; k <= 7; k++) if (k !== 0) marks.push(pad(30, 1.8, MARK_WHITE, end, r.z + k * 2.8, 0.06));
  for (const x of [r.toX - 150, r.fromX + 150]) for (const s of [1, -1]) marks.push(pad(22, 3, MARK_WHITE, x, r.z + s * 8, 0.06));
  // Taxiway and apron lane centrelines, stand lead-in lines.
  marks.push(pad(tw.toX - tw.fromX, 0.4, MARK_YELLOW, (tw.fromX + tw.toX) / 2, tw.z, 0.05));
  marks.push(pad(plan.apronLane.toX - plan.apronLane.fromX, 0.4, MARK_YELLOW, (plan.apronLane.fromX + plan.apronLane.toX) / 2, plan.apronLane.z, 0.05));
  for (const g of plan.gates) marks.push(pad(0.4, plan.apronLane.z - g.stand.z + 18, MARK_YELLOW, g.stand.x, (plan.apronLane.z + g.stand.z - 18) / 2, 0.05));
  return { surface, marks };
}

function palm(): BufferGeometry {
  return assemble([
    place(paint(cylinder(0.22, 0.32, 7, 7), '#8A6A48'), { y: 3.5 }),
    place(paint(blob(1.8, 1), '#4F9A45'), { y: 7.4, scale: [1.6, 0.45, 1.6] }),
  ]);
}

export function createAirportView(palette: Palette, atlas: TextAtlas | null): AirportView {
  const plan = airportPlan();
  const group = new Group();
  group.name = 'airport';
  const standard = (): MeshStandardMaterial => new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  const basic = (): MeshBasicMaterial => new MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  // ---------- static (H10) ----------
  const parts = staticParts(plan);
  const signs = signQuads(plan, atlas);
  const solid = new Mesh(assemble([...parts.solid, ...signs.vertical.flatMap(boardFor)]), standard());
  solid.castShadow = true;
  solid.receiveShadow = true;
  const glassMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.6, emissive: '#FFCF8A', emissiveIntensity: 0 });
  const glass = new Mesh(assemble(parts.glass), glassMat);
  const glowMat = basic();
  const glow = new Mesh(assemble(parts.glow), glowMat);
  const pave = pavementParts(plan);
  const surface = new Mesh(assemble(pave.surface), new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  surface.receiveShadow = true;
  const marks = new Mesh(assemble(pave.marks), new MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 }));
  const textMat = new MeshBasicMaterial({ color: '#FFF4D6', transparent: true, alphaTest: 0.35, toneMapped: false, ...(atlas ? { map: atlas.texture } : { visible: false }) });
  const text = new Mesh(quadGeometry(signs.vertical, atlas?.layout ?? null), textMat);
  const groundTextMat = new MeshBasicMaterial({ color: MARK_WHITE, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...(atlas ? { map: atlas.texture } : { visible: false }) });
  const groundText = new Mesh(quadGeometry(signs.ground, atlas?.layout ?? null), groundTextMat);

  const palmSpots: { x: number; z: number }[] = [];
  for (let z = plan.boulevard.fromZ + 10; z < 180; z += 40) {
    if (plan.overpasses.some((o) => Math.abs(o.z - z) < 14)) continue;
    for (const side of [1, -1]) palmSpots.push({ x: plan.boulevard.x + side * (plan.boulevard.width / 2 + 6), z });
  }
  const palms = new InstancedMesh(palm(), standard(), palmSpots.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const v = new Vector3();
  palmSpots.forEach((p, i) => palms.setMatrixAt(i, m.compose(v.set(p.x, 0, p.z), q.setFromAxisAngle(UP, i * 1.7), ONE)));
  palms.castShadow = true;

  // ---------- airfield lights (H8) ----------
  const lights = new InstancedMesh(slab(0.7, 0.35, 0.7).translate(0, 0.3, 0), new MeshBasicMaterial({ toneMapped: false }), plan.airfieldLights.length);
  const lightBase = plan.airfieldLights.map((l) => new Color(LIGHT_COLOUR[l.colour]));
  plan.airfieldLights.forEach((l, i) => {
    lights.setMatrixAt(i, m.compose(v.set(l.x, 0, l.z), q.identity(), ONE));
    lights.setColorAt(i, new Color(0x222222));
  });
  let lastLevel = -1;

  // ---------- tower beacon ----------
  const tower = plan.buildings.find((b) => b.id === 'tower');
  const beacon = new Mesh(assemble([place(paint(slab(0.6, 0.5, 0.5), '#3BFF6E'), { x: 0.5 }), place(paint(slab(0.6, 0.5, 0.5), '#FFFFFF'), { x: -0.5 })]), basic());
  beacon.position.set(tower?.x ?? 0, (tower?.height ?? 60) + 0.6, tower?.z ?? 0);

  // ---------- jets and bridges (H9) ----------
  const jet = jetParts();
  const jetBody = new InstancedMesh(jet.body, standard(), JET_CAPACITY);
  const jetLivery = new InstancedMesh(jet.livery, new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), JET_CAPACITY);
  const jetWindows = new InstancedMesh(jet.windows, standard(), JET_CAPACITY);
  const jetGear = new InstancedMesh(jet.gear, standard(), JET_CAPACITY);
  const jetLightMat = basic();
  const jetLights = new InstancedMesh(jet.lights, jetLightMat, JET_CAPACITY);
  for (const mesh of [jetBody, jetLivery, jetWindows, jetGear]) mesh.castShadow = true;
  const tunnel = new InstancedMesh(paint(slab(2.6, 2.6, 1), '#D9DCE1'), standard(), plan.gates.length);
  const cab = new InstancedMesh(paint(roundedBox(3.2, 3, 3.2, 0.4, 1), '#C9CED6'), standard(), plan.gates.length);
  const dock = plan.gates.map(() => 0);

  // ---------- traffic and airport vehicles (H6) ----------
  const sedan = vehicleAsset('sedan', palette);
  const shuttle = vehicleAsset('shuttle', palette);
  const carCap = 30;
  const carPaint = new InstancedMesh(sedan.paint, new MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), carCap);
  const carTrim = new InstancedMesh(sedan.trim, standard(), carCap);
  const carLampMat = basic();
  const carLamps = new InstancedMesh(sedan.lamps, carLampMat, carCap);
  const busPaint = new InstancedMesh(shuttle.paint, standard(), 4);
  const busTrim = new InstancedMesh(shuttle.trim, standard(), 4);
  const busLamps = new InstancedMesh(shuttle.lamps, carLampMat, 4);
  const tug = new InstancedMesh(assemble([place(paint(roundedBox(4.5, 1.4, 2.6, 0.3, 1), '#F2C230'), { y: 0.9 }), place(paint(roundedBox(1.2, 1, 1.8, 0.2, 1), GRAPHITE), { x: -1.2, y: 2 })]), standard(), 4);
  const fuelTruck = new Mesh(
    assemble([place(paint(roundedBox(2.4, 2.4, 2.4, 0.3, 1), '#F4F4F2'), { x: 3.2, y: 1.6 }), place(paint(cylinder(1.3, 1.3, 6.5, 12), '#E8E8E8'), { x: -1, y: 1.8, rotZ: Math.PI / 2 }), place(paint(slab(8.5, 0.4, 2.5), GRAPHITE), { y: 0.5 })]),
    standard(),
  );
  const followMe = new Mesh(assemble([place(paint(roundedBox(4.4, 1.4, 1.9, 0.4, 2), '#F2C230'), { y: 0.95 }), place(paint(slab(1.4, 0.5, 1.4), '#2B2D35'), { y: 1.9 })]), standard());
  const paintColours = palette.carPaints.map((c) => new Color(c));
  const taxi = new Color('#F2C230');
  for (const mesh of [carPaint, carTrim, busPaint, busTrim, tug]) mesh.castShadow = true;

  group.add(surface, marks, groundText, solid, glass, glow, text, palms, lights, beacon, jetBody, jetLivery, jetWindows, jetGear, jetLights, tunnel, cab, carPaint, carTrim, carLamps, busPaint, busTrim, busLamps, tug, fuelTruck, followMe);

  const schedule: FlightSchedule = createFlightSchedule();
  let rendered: readonly AircraftPose[] = [];
  let now = 0;
  const colour = new Color();

  const placeJet = (i: number, a: AircraftPose): void => {
    const yaw = new Quaternion().setFromAxisAngle(UP, -a.heading);
    const pitch = new Quaternion().setFromAxisAngle(Z_AXIS, a.pitch);
    const rot = yaw.multiply(pitch);
    const pos = new Vector3(a.x, a.y, a.z);
    for (const mesh of [jetBody, jetLivery, jetLights]) mesh.setMatrixAt(i, m.compose(pos, rot, ONE));
    jetWindows.setMatrixAt(i, m.compose(pos, rot, a.airline === 'sunlineCargo' ? ZERO : ONE));
    jetGear.setMatrixAt(i, m.compose(pos, rot, new Vector3(1, Math.max(0.001, a.gear), 1)));
    jetLivery.setColorAt(i, colour.set(AIRLINE_COLOUR[a.airline]));
  };

  return {
    group,
    aircraft: () => rendered,
    surge() {
      schedule.scheduleExtra(now);
    },
    nextLandingSec: () => schedule.nextTouchdown(now),
    update(frame) {
      now = frame.time;
      const detail = airportDetail(frame.tier, frame.reducedMotion);
      const all = schedule.aircraftAt(frame.time);
      rendered = detail.flights ? all : all.filter((a) => a.phase === 'parked');
      const list = rendered.slice(0, JET_CAPACITY);
      list.forEach((a, i) => {
        placeJet(i, a);
      });
      for (const mesh of [jetBody, jetLivery, jetWindows, jetGear, jetLights]) {
        mesh.count = list.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      if (jetLivery.instanceColor) jetLivery.instanceColor.needsUpdate = true;
      const flash = detail.lightAnim && Math.sin(frame.time * 7) > 0.6;
      jetLightMat.color.setScalar(0.5 + 1.6 * frame.night + (flash ? 1 : 0));

      // Jet bridges dock to parked jets at their gate.
      // Bridges glide over a few frames (a fixed per-frame step; airport time may be paused).
      const ease = 0.14;
      plan.gates.forEach((g, i) => {
        const docked = list.some((a) => a.gate === g.id && a.phase === 'parked');
        dock[i] = (dock[i] ?? 0) + ((docked ? 1 : 0) - (dock[i] ?? 0)) * ease;
        const root = plan.terminal.z + plan.terminal.depth / 2;
        const cabZ = root + 6 + 14 * (dock[i] ?? 0);
        tunnel.setMatrixAt(i, m.compose(v.set(g.stand.x + 4, 5.2, (root + cabZ) / 2), q.identity(), new Vector3(1, 1, cabZ - root)));
        cab.setMatrixAt(i, m.compose(v.set(g.stand.x + 4, 5.2, cabZ), q.identity(), ONE));
      });
      tunnel.instanceMatrix.needsUpdate = true;
      cab.instanceMatrix.needsUpdate = true;

      // Airfield lights follow the street lamps.
      const level = frame.lampLevel;
      if (Math.abs(level - lastLevel) > 0.01) {
        lastLevel = level;
        plan.airfieldLights.forEach((_, i) => lights.setColorAt(i, colour.copy(lightBase[i] ?? colour).multiplyScalar(0.15 + 2.2 * level)));
        if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
      }
      if (detail.lightAnim) beacon.rotation.y = frame.time * 2.4;
      glowMat.color.setScalar(0.5 + 1.7 * frame.night);
      glassMat.emissiveIntensity = 0.15 * frame.night;
      textMat.color.set('#FFF4D6').multiplyScalar(0.95 + 0.95 * frame.night);

      // Background traffic (density by tier) and airport vehicles.
      const traffic = trafficAt(frame.time, detail.traffic);
      let cars = 0;
      let buses = 0;
      for (const t of traffic) {
        const pose = m.compose(v.set(t.x, t.y, t.z), q.setFromAxisAngle(UP, -t.heading), ONE);
        if (t.kind === 'bus') {
          if (buses >= 4) continue;
          for (const mesh of [busPaint, busTrim, busLamps]) mesh.setMatrixAt(buses, pose);
          buses++;
        } else {
          if (cars >= carCap) continue;
          for (const mesh of [carPaint, carTrim, carLamps]) mesh.setMatrixAt(cars, pose);
          carPaint.setColorAt(cars, t.kind === 'taxi' ? taxi : (paintColours[cars % paintColours.length] ?? taxi));
          cars++;
        }
      }
      for (const [mesh, n] of [[carPaint, cars], [carTrim, cars], [carLamps, cars], [busPaint, buses], [busTrim, buses], [busLamps, buses]] as const) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      if (carPaint.instanceColor) carPaint.instanceColor.needsUpdate = true;
      carLampMat.color.setScalar(0.6 + 1.6 * frame.night);

      const service = detail.vehicles ? serviceVehiclesAt(frame.time, list) : [];
      let tugs = 0;
      fuelTruck.visible = false;
      followMe.visible = false;
      for (const s of service) {
        if (s.kind === 'tug' && tugs < 4) {
          tug.setMatrixAt(tugs++, m.compose(v.set(s.x, 0, s.z), q.setFromAxisAngle(UP, -s.heading), ONE));
        } else if (s.kind === 'fuel') {
          fuelTruck.visible = true;
          fuelTruck.position.set(s.x, 0, s.z);
          fuelTruck.rotation.set(0, -s.heading, 0);
        } else if (s.kind === 'followMe') {
          followMe.visible = true;
          followMe.position.set(s.x, 0, s.z);
          followMe.rotation.set(0, -s.heading, 0);
        }
      }
      tug.count = tugs;
      tug.instanceMatrix.needsUpdate = true;
    },
  };
}
