import type { BufferGeometry } from 'three';
import type { BuildingLayout } from '../../layout/hub';
import { assemble, paint, place } from '../kit/assemble';
import { cylinder, roundedBox } from '../kit/shapes';
import type { Palette } from '../palette';

/**
 * Pixar-style building (V-3), in world coordinates, vertex-coloured (P1):
 *  - solid: walls, frames, roofs, kiosks, pumps, booths
 *  - glass: curtain walls, skylights, windows (slightly reflective)
 *  - glow: signage, window strips and screens that light up at night
 * Must stay within the layout footprint (+0.6 m for trim), apart from the gate booth, which
 * sits between the lanes, and the lot, which is a surface. Bays must stay visible from above.
 */
export interface BuildingAsset {
  readonly solid: BufferGeometry;
  readonly glass: BufferGeometry;
  readonly glow: BufferGeometry;
}

interface Parts {
  readonly solid: BufferGeometry[];
  readonly glass: BufferGeometry[];
  readonly glow: BufferGeometry[];
}

const SIGN_GLOW = '#FFD98A';
const SCREEN = '#9FE3FF';
const FRAME = '#B9BCC4';

/** Rounded box placed by its centre. */
const block = (w: number, h: number, d: number, colour: string, x: number, y: number, z: number, r = 0.12): BufferGeometry =>
  place(paint(roundedBox(w, h, d, r, 1), colour), { x, y, z });

const column = (x: number, z: number, h: number, colour: string): BufferGeometry => place(paint(cylinder(0.28, 0.32, h, 10), colour), { x, y: h / 2, z });

/**
 * Open canopy: columns, a perimeter frame, a glass roof and gold fascia. Columns sit only at the
 * given x positions on the two long edges (chosen between bays), so no lane or parked car is blocked.
 */
function canopy(b: BuildingLayout, p: Palette, out: Parts, columnXs: readonly number[]): void {
  const y = b.height;
  const z0 = b.z - b.depth / 2 + 0.35;
  const z1 = b.z + b.depth / 2 - 0.35;
  for (const x of columnXs) for (const z of [z0, z1]) out.solid.push(column(x, z, y, p.clay));
  // Perimeter frame (beams only, so nothing solid sits over a bay).
  out.solid.push(block(b.width, 0.45, 0.45, FRAME, b.x, y, z0), block(b.width, 0.45, 0.45, FRAME, b.x, y, z1));
  out.solid.push(block(0.45, 0.45, b.depth - 0.7, FRAME, b.x - b.width / 2 + 0.25, y, b.z), block(0.45, 0.45, b.depth - 0.7, FRAME, b.x + b.width / 2 - 0.25, y, b.z));
  out.glass.push(block(b.width - 0.8, 0.12, b.depth - 1.2, p.glass, b.x, y + 0.2, b.z, 0.05));
  // Gold fascia that lights up at night along both long edges.
  out.glow.push(block(b.width - 0.4, 0.22, 0.12, SIGN_GLOW, b.x, y + 0.42, z0 - 0.2, 0.05), block(b.width - 0.4, 0.22, 0.12, SIGN_GLOW, b.x, y + 0.42, z1 + 0.2, 0.05));
}

function terminal(b: BuildingLayout, p: Palette, out: Parts): void {
  const w = b.width - 2;
  const d = b.depth - 2;
  const east = b.x + w / 2;
  out.solid.push(block(w, b.height, d, p.clay, b.x, b.height / 2, b.z, 0.8));
  out.solid.push(block(b.width - 0.4, 0.7, b.depth - 0.4, p.roof, b.x, b.height + 0.35, b.z, 0.3));
  // Rooftop plant.
  for (const [dx, dz] of [[-12, -10], [-4, 12], [8, -6]] as const) out.solid.push(block(5, 1.6, 3.5, '#C8CBD2', b.x + dx, b.height + 1.5, b.z + dz, 0.3));
  // Glass curtain wall facing the lot (east), with mullions every 3 m.
  out.glass.push(block(0.25, b.height * 0.72, d * 0.84, p.glass, east + 0.12, b.height * 0.42, b.z, 0.06));
  for (let z = b.z - d * 0.42; z <= b.z + d * 0.42 + 1e-6; z += 3) out.solid.push(block(0.32, b.height * 0.72, 0.18, FRAME, east + 0.16, b.height * 0.42, z, 0.04));
  // Ribbon windows on the north and south faces.
  for (const sz of [1, -1]) out.glass.push(block(w * 0.86, 2.2, 0.2, p.glass, b.x, b.height * 0.6, b.z + sz * (d / 2 + 0.08), 0.06));
  // Entrance canopy over the door and the GoldLane sign band above it.
  out.solid.push(block(1.4, 0.35, 12, p.roof, east + 0.6, 4.2, b.z + 4.8, 0.12));
  out.glow.push(block(0.25, 1.4, 14, SIGN_GLOW, east + 0.3, b.height - 1.3, b.z, 0.1));
  out.glow.push(block(0.28, 1.4, 1.4, p.accent, east + 0.32, b.height - 1.3, b.z - 8.2, 0.25));
  // Planters along the facade.
  for (let z = b.z - d * 0.4; z <= b.z + d * 0.4; z += 6.5) out.solid.push(block(0.9, 0.6, 2.2, '#9C8A74', east + 0.55, 0.3, z, 0.2));
}

function returnCanopy(b: BuildingLayout, p: Palette, out: Parts): void {
  canopy(b, p, out, [b.x - b.width / 2 + 0.5, b.x, b.x + b.width / 2 - 0.5]);
  // A kiosk pod beside each inspection lane, between the lanes, with a screen facing the driver.
  for (const z of [-76, -70, -64, -58]) {
    out.solid.push(block(0.9, 1.5, 0.8, p.clay, -101, 0.75, z, 0.25), block(1.1, 0.12, 1, p.accent, -101, 1.56, z, 0.05));
    out.glow.push(block(0.06, 0.42, 0.5, SCREEN, -100.53, 1.05, z, 0.02));
  }
}

function washTunnel(b: BuildingLayout, p: Palette, out: Parts): void {
  const zOut = [b.z - b.depth / 2 + 0.35, b.z + b.depth / 2 - 0.35];
  const x0 = b.x - b.width / 2 + 0.4;
  const x1 = b.x + b.width / 2 - 0.4;
  // Side walls along the whole tunnel; the divider starts only where the two lanes have separated.
  for (const z of zOut) out.solid.push(block(b.width - 0.8, 4.2, 0.4, p.clay, b.x, 2.1, z, 0.15), block(b.width - 0.8, 0.35, 0.45, p.accent, b.x, 3.2, z, 0.08));
  out.solid.push(block(6, 3.6, 0.35, p.clay, 13.5, 1.8, b.z, 0.12));
  // Entry and exit arches (beams across the tunnel ends only).
  for (const x of [x0, x1]) {
    for (const z of zOut) out.solid.push(block(0.5, 4.6, 0.5, FRAME, x, 2.3, z, 0.1));
    out.solid.push(block(0.5, 0.6, b.depth - 0.7, FRAME, x, 4.6, b.z, 0.1));
  }
  out.glass.push(block(b.width - 1.6, 0.1, b.depth - 1.4, p.glass, b.x, 4.4, b.z, 0.04));
  out.glow.push(block(0.15, 0.7, 5, SIGN_GLOW, x0 - 0.05, 5.2, b.z, 0.08));
}

function serviceGarage(b: BuildingLayout, p: Palette, out: Parts): void {
  const xFront = 106;
  const xBack = b.x + b.width / 2 - 0.3;
  const len = xBack - xFront;
  const xMid = (xFront + xBack) / 2;
  // Outer walls and the two dividers between bays; the back stays open for the tow truck.
  for (const z of [b.z - b.depth / 2 + 0.4, b.z + b.depth / 2 - 0.4, -79, -73]) {
    out.solid.push(block(len, 5.4, 0.35, p.clay, xMid, 2.7, z, 0.12));
  }
  // Roll-up door frames on the entry face (the doors themselves animate in the renderer).
  for (const z of [-85.2, -79, -73, -66.8]) out.solid.push(block(0.45, 4.2, 0.45, FRAME, xFront, 2.1, z, 0.08));
  out.solid.push(block(0.6, 1.1, b.depth - 0.8, p.clay, xFront, 4.75, b.z, 0.12));
  // Tool racks on the outer walls.
  for (const z of [b.z - b.depth / 2 + 0.9, b.z + b.depth / 2 - 0.9]) out.solid.push(block(4, 1.6, 0.5, '#C55A3C', xMid + 3, 0.9, z, 0.1));
  out.glass.push(block(len, 0.12, b.depth - 1.2, p.glass, xMid, 5.5, b.z, 0.05));
  out.glow.push(block(0.2, 0.7, 9, SIGN_GLOW, xFront - 0.35, 4.7, b.z, 0.08));
}

function gates(b: BuildingLayout, p: Palette, out: Parts): void {
  // Booth between the two exit lanes, with windows all round and a lit roof sign.
  const x = b.x + 5;
  out.solid.push(block(2.4, 2.4, 1.3, p.clay, x, 1.2, b.z, 0.2), block(2.9, 0.3, 1.6, p.roof, x, 2.55, b.z, 0.1));
  out.glass.push(block(2.0, 0.9, 1.36, p.glass, x, 1.6, b.z, 0.08));
  out.glow.push(block(2.6, 0.35, 0.6, SIGN_GLOW, x, 2.9, b.z, 0.08));
  // Barrier pivot posts (the arms animate in the renderer).
  out.solid.push(block(0.4, 1.1, 0.4, p.accent, b.x - 1.4, 0.55, b.z - 0.5, 0.08), block(0.4, 1.1, 0.4, p.accent, b.x - 1.4, 0.55, b.z + 0.5, 0.08));
}

function depot(b: BuildingLayout, p: Palette, out: Parts): void {
  // Back wall and roof only: the tow truck drives in from the east and out to the west.
  out.solid.push(block(b.width - 0.6, 4.2, 0.35, p.clay, b.x, 2.1, b.z - b.depth / 2 + 0.3, 0.12));
  for (const x of [b.x - b.width / 2 + 0.4, b.x + b.width / 2 - 0.4]) out.solid.push(column(x, b.z + b.depth / 2 - 0.4, 4.4, p.clay));
  out.solid.push(block(b.width - 0.4, 0.4, 0.4, FRAME, b.x, 4.5, b.z + b.depth / 2 - 0.4));
  out.glass.push(block(b.width - 0.6, 0.12, b.depth - 0.8, p.glass, b.x, 4.65, b.z, 0.05));
  out.glow.push(block(4, 0.5, 0.12, SIGN_GLOW, b.x, 3.6, b.z - b.depth / 2 + 0.55, 0.05));
}

function lotKerb(b: BuildingLayout, p: Palette, out: Parts): void {
  out.solid.push(block(b.width, 0.15, 0.3, p.clay, b.x, 0.08, b.z - b.depth / 2));
  out.glass.push(block(0.3, 0.05, 0.3, p.glass, b.x, 0.03, b.z));
  out.glow.push(block(0.3, 0.05, 0.3, SIGN_GLOW, b.x, 0.03, b.z));
}

export function buildingAsset(layout: BuildingLayout, palette: Palette): BuildingAsset {
  const out: Parts = { solid: [], glass: [], glow: [] };
  switch (layout.id) {
    case 'terminal':
      terminal(layout, palette, out);
      break;
    case 'canopy':
      returnCanopy(layout, palette, out);
      break;
    case 'wash':
      washTunnel(layout, palette, out);
      break;
    case 'service':
      serviceGarage(layout, palette, out);
      break;
    case 'evHub':
      // Columns between charger bays (bays every 4 m from x = 111).
      canopy(layout, palette, out, [layout.x - layout.width / 2 + 0.5, 125, layout.x + layout.width / 2 - 0.5]);
      break;
    case 'fuel':
      // Columns between pumps (pumps every 6 m from x = 161).
      canopy(layout, palette, out, [layout.x - layout.width / 2 + 0.5, 164, 176, layout.x + layout.width / 2 - 0.5]);
      break;
    case 'gates':
      gates(layout, palette, out);
      break;
    case 'depot':
      depot(layout, palette, out);
      break;
    default:
      lotKerb(layout, palette, out);
      break;
  }
  return { solid: assemble(out.solid), glass: assemble(out.glass), glow: assemble(out.glow) };
}
