import type { BufferGeometry } from 'three';
import { brand } from '../../config/brand';
import { dimensions } from '../../config/facility';
import { assemble, paint, place } from '../kit/assemble';
import { cylinder, roundedBox, slab } from '../kit/shapes';
import type { Palette } from '../palette';

export type VehicleAssetKind = 'sedan' | 'suv' | 'ev' | 'shuttle' | 'tow' | 'van' | 'cart';

/**
 * Pixar-style vehicle, length along +x (front at +x), centred on its footprint, wheels on y = 0 (P2):
 *  - paint: body panels in white vertex colour, tinted per instance (car paint); liveried kinds bake their colours
 *  - trim: untinted parts (tyres, hubcaps, glass, window frames, bumpers, mirrors)
 *  - lamps: headlights (warm white) and taillights (red); glow at night
 * Each part is vertex-coloured. The union must fit the simulation footprint (P10).
 */
export interface VehicleAsset {
  readonly paint: BufferGeometry;
  readonly trim: BufferGeometry;
  readonly lamps: BufferGeometry;
}

const TYRE = '#1C1D22';
const HUB = '#C9CDD4';
const BUMPER = '#3A3D45';
const HEAD = '#FFF3C4';
const TAIL = '#E0262B';
const WHITE = '#FFFFFF';
/** GoldLane fleet livery (B-4): the brand gold, in every theme. */
const LIVERY = brand.colors.accent;

type Parts = BufferGeometry[];

const box = (l: number, h: number, w: number, r: number, colour: string, x: number, y: number, z = 0, seg = 1): BufferGeometry =>
  place(paint(roundedBox(l, h, w, r, seg), colour), { x, y, z });

/** Four wheels with hubcaps; outer faces stay inside the footprint width. */
function wheels(trim: Parts, l: number, w: number, r: number, inset: number): void {
  const tyreW = Math.min(0.3, w * 0.14);
  const zc = w / 2 - tyreW / 2 - 0.02;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = sx * (l / 2 - inset);
      trim.push(place(paint(cylinder(r, r, tyreW, 12), TYRE), { rotX: Math.PI / 2, x, y: r, z: sz * zc }));
      trim.push(place(paint(cylinder(r * 0.55, r * 0.55, tyreW + 0.02, 10), HUB), { rotX: Math.PI / 2, x, y: r, z: sz * zc }));
    }
  }
}

/** Head- and taillights at the very front and back faces. */
function lights(lamps: Parts, l: number, w: number, y: number, spread: number, lightBar: boolean): void {
  for (const sz of [1, -1]) {
    lamps.push(box(0.08, 0.16, 0.34, 0.03, HEAD, l / 2 - 0.04, y, sz * spread));
    lamps.push(box(0.08, 0.14, 0.3, 0.03, TAIL, -l / 2 + 0.04, y, sz * spread));
  }
  if (lightBar) lamps.push(box(0.06, 0.05, w * 0.8, 0.02, '#E8F6FF', l / 2 - 0.03, y + 0.12));
}

interface CarShape {
  readonly wheel: number;
  readonly clearance: number;
  readonly bodyH: number;
  readonly cabinL: number;
  readonly cabinH: number;
  readonly cabinX: number;
  readonly roofRails: boolean;
  readonly lightBar: boolean;
}

const CARS: Readonly<Record<'sedan' | 'suv' | 'ev', CarShape>> = {
  // Low three-box saloon.
  sedan: { wheel: 0.34, clearance: 0.22, bodyH: 0.55, cabinL: 0.5, cabinH: 0.48, cabinX: -0.04, roofRails: false, lightBar: false },
  // Tall and boxy, with roof rails.
  suv: { wheel: 0.42, clearance: 0.3, bodyH: 0.75, cabinL: 0.62, cabinH: 0.58, cabinX: -0.07, roofRails: true, lightBar: false },
  // Smooth crossover with a long glass cabin and a front light bar.
  ev: { wheel: 0.38, clearance: 0.24, bodyH: 0.62, cabinL: 0.6, cabinH: 0.52, cabinX: -0.02, roofRails: false, lightBar: true },
};

function car(kind: 'sedan' | 'suv' | 'ev', palette: Palette): VehicleAsset {
  const { length: l, width: w } = dimensions[kind];
  const s = CARS[kind];
  const paintParts: Parts = [];
  const trim: Parts = [];
  const lamps: Parts = [];
  const bodyTop = s.clearance + s.bodyH;
  const bodyW = w * 0.92;

  paintParts.push(box(l - 0.16, s.bodyH, bodyW, 0.24, WHITE, 0, s.clearance + s.bodyH / 2, 0, 2));
  // Glass cabin with a painted roof cap on top: reads as windows with frames.
  const cabinL = l * s.cabinL;
  trim.push(box(cabinL, s.cabinH, bodyW * 0.88, 0.22, palette.glass, l * s.cabinX, bodyTop + s.cabinH / 2, 0, 2));
  paintParts.push(box(cabinL * 0.9, 0.07, bodyW * 0.86, 0.035, WHITE, l * s.cabinX, bodyTop + s.cabinH + 0.02));
  if (s.roofRails) {
    for (const sz of [1, -1]) trim.push(box(cabinL * 0.85, 0.06, 0.06, 0.02, '#8D939E', l * s.cabinX, bodyTop + s.cabinH + 0.08, sz * bodyW * 0.36));
  }
  // Bumpers reach the very ends of the footprint; mirrors reach its full width.
  trim.push(box(0.16, 0.24, bodyW * 0.96, 0.06, BUMPER, l / 2 - 0.08, s.clearance + 0.14));
  trim.push(box(0.16, 0.24, bodyW * 0.96, 0.06, BUMPER, -l / 2 + 0.08, s.clearance + 0.14));
  for (const sz of [1, -1]) {
    paintParts.push(box(0.16, 0.1, (w - bodyW) / 2 + 0.04, 0.03, WHITE, l * s.cabinX + cabinL / 2 - 0.1, bodyTop + 0.06, sz * (w / 2 - ((w - bodyW) / 2 + 0.04) / 2)));
  }
  // Livery (B-4, G11): a gold stripe along both sides and a small door mark, part of the untinted trim.
  for (const sz of [1, -1]) {
    const side = sz * (bodyW / 2 + 0.006);
    trim.push(place(paint(slab(l * 0.62, 0.07, 0.012), LIVERY), { x: -l * 0.02, y: s.clearance + s.bodyH * 0.55, z: side }));
    trim.push(place(paint(slab(0.3, 0.16, 0.012), LIVERY), { x: l * 0.1, y: s.clearance + s.bodyH * 0.55 + 0.16, z: side }));
  }
  wheels(trim, l, w, s.wheel, l * 0.2);
  lights(lamps, l, w, bodyTop - 0.16, bodyW / 2 - 0.26, s.lightBar);
  return { paint: assemble(paintParts), trim: assemble(trim), lamps: assemble(lamps) };
}

function shuttle(palette: Palette): VehicleAsset {
  const { length: l, width: w } = dimensions.shuttle;
  const body: Parts = [box(l, 2.3, w * 0.96, 0.45, palette.accent, 0, 0.35 + 1.15, 0, 2), box(l * 0.94, 0.22, w * 0.86, 0.1, '#F7F3EA', 0, 2.75)];
  const trim: Parts = [
    // Window band down both sides and a big windscreen.
    box(l * 0.86, 0.78, w * 0.97, 0.12, palette.glass, -0.15, 1.95, 0, 2),
    box(0.1, 1.1, w * 0.8, 0.05, palette.glass, l / 2 - 0.05, 1.8),
    box(1.7, 0.36, 1.25, 0.12, '#D6D9DF', -1.2, 3.02),
    box(0.16, 0.3, w * 0.9, 0.06, BUMPER, l / 2 - 0.08, 0.55),
    box(0.16, 0.3, w * 0.9, 0.06, BUMPER, -l / 2 + 0.08, 0.55),
  ];
  wheels(trim, l, w * 0.96, 0.5, 1.6);
  const lamps: Parts = [];
  lights(lamps, l, w, 0.9, w / 2 - 0.4, false);
  return { paint: assemble(body), trim: assemble(trim), lamps: assemble(lamps) };
}

function tow(palette: Palette): VehicleAsset {
  const { length: l, width: w } = dimensions.tow;
  const body: Parts = [
    box(2.2, 1.9, w * 0.95, 0.35, palette.tow, l / 2 - 1.1, 0.45 + 0.95, 0, 2),
    box(l - 2.25, 0.36, w * 0.95, 0.08, '#5B5F6B', -1.1, 0.85),
    box(0.3, 0.9, w * 0.9, 0.06, palette.tow, -l / 2 + 0.15, 1.35),
  ];
  const trim: Parts = [
    box(0.1, 0.8, w * 0.8, 0.05, palette.glass, l / 2 - 0.06, 1.75),
    box(1.6, 0.7, w * 0.96, 0.1, palette.glass, l / 2 - 1.15, 1.75),
    box(0.5, 0.22, 0.5, 0.08, '#FFB020', l / 2 - 1.2, 2.47),
    box(0.16, 0.26, w * 0.9, 0.06, BUMPER, l / 2 - 0.08, 0.6),
  ];
  wheels(trim, l, w * 0.95, 0.45, 1.1);
  const lamps: Parts = [];
  lights(lamps, l, w, 1.0, w / 2 - 0.35, false);
  return { paint: assemble(body), trim: assemble(trim), lamps: assemble(lamps) };
}

function van(palette: Palette): VehicleAsset {
  const { length: l, width: w } = dimensions.van;
  const body: Parts = [box(l, 1.85, w * 0.95, 0.35, '#F2F2F0', 0, 0.35 + 0.925, 0, 2), box(l * 0.9, 0.18, w * 0.97, 0.06, palette.accent, -0.1, 1.15)];
  const trim: Parts = [
    box(0.12, 0.7, w * 0.82, 0.05, palette.glass, l / 2 - 0.06, 1.75),
    box(1.0, 0.62, w * 0.97, 0.08, palette.glass, l / 2 - 0.75, 1.75),
    box(0.16, 0.26, w * 0.9, 0.06, BUMPER, l / 2 - 0.08, 0.5),
    box(0.16, 0.26, w * 0.9, 0.06, BUMPER, -l / 2 + 0.08, 0.5),
  ];
  wheels(trim, l, w * 0.95, 0.4, 1.0);
  const lamps: Parts = [];
  lights(lamps, l, w, 0.95, w / 2 - 0.3, false);
  return { paint: assemble(body), trim: assemble(trim), lamps: assemble(lamps) };
}

function cart(palette: Palette): VehicleAsset {
  const { length: l, width: w } = dimensions.cart;
  const body: Parts = [box(l - 0.2, 0.45, w * 0.92, 0.15, '#F2F2F0', 0, 0.45, 0, 2), box(0.5, 0.55, w * 0.85, 0.1, '#F2F2F0', -0.2, 0.95)];
  const trim: Parts = [
    box(l * 0.75, 0.08, w * 0.98, 0.04, palette.accent, -0.05, 1.88),
    box(0.06, 0.55, w * 0.7, 0.03, palette.glass, l / 2 - 0.55, 1.15),
  ];
  for (const sx of [0.62, -0.72]) for (const sz of [1, -1]) trim.push(place(paint(cylinder(0.025, 0.025, 1.2, 6), '#9AA0AA'), { x: sx, y: 1.25, z: sz * w * 0.42 }));
  wheels(trim, l, w * 0.92, 0.22, 0.42);
  const lamps: Parts = [];
  lights(lamps, l, w, 0.5, w / 2 - 0.22, false);
  return { paint: assemble(body), trim: assemble(trim), lamps: assemble(lamps) };
}

export function vehicleAsset(kind: VehicleAssetKind, palette: Palette): VehicleAsset {
  switch (kind) {
    case 'sedan':
    case 'suv':
    case 'ev':
      return car(kind, palette);
    case 'shuttle':
      return shuttle(palette);
    case 'tow':
      return tow(palette);
    case 'van':
      return van(palette);
    case 'cart':
      return cart(palette);
  }
}
