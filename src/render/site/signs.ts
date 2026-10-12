import { BufferGeometry, Float32BufferAttribute } from 'three';
import { buildingSigns, PYLON_TEXT, SECURITY_TEXT, type BuildingSign, type SignFace } from '../../config/signage';
import { hub } from '../../layout/hub';
import type { SitePlan } from '../../layout/site';
import type { AtlasEntry, AtlasLayout } from '../text/atlas';

// Sign geometry (B-1…B-3, architecture §18 G3): text quads with UVs into the shared atlas, and
// vertex-coloured boards behind them. Pure geometry building; the meshes are made in render/site.ts.

type V3 = readonly [number, number, number];

/** A text quad: centre, the text's right and up directions (unit), size in metres, and its string. */
export interface TextQuad {
  readonly c: V3;
  readonly right: V3;
  readonly up: V3;
  readonly w: number;
  readonly h: number;
  readonly text: string;
}

const TEXT_PX = 72;
const ROOF_PX = 96;
/** Line height to letter height: the atlas draws letters at about 0.8 of the line. */
const LINE = 1.25;

/** Every string the site draws, for the atlas. */
export function signEntries(plan: SitePlan): readonly AtlasEntry[] {
  const texts = new Set<string>([
    ...buildingSigns.map((s) => s.text),
    PYLON_TEXT,
    SECURITY_TEXT,
    ...plan.gantries.map((g) => g.text),
    ...plan.directionSigns.flatMap((s) => s.lines),
    ...plan.groundText.map((t) => t.text),
  ]);
  return [...texts].map((text) => ({ text, px: text === PYLON_TEXT ? ROOF_PX : TEXT_PX }));
}

/** Right vector of text on a vertical face whose outward normal is (nx, nz). */
const rightOf = (nx: number, nz: number): V3 => [nz, 0, -nx];
const UP: V3 = [0, 1, 0];

/** Width of a line of text at a letter height, from the atlas aspect (fallback: 0.6 em per character). */
export function textWidth(layout: AtlasLayout | null, text: string, letterHeight: number): number {
  const r = layout?.rects.get(text);
  const h = letterHeight * LINE;
  return r ? h * (r.w / r.h) : h * 0.6 * text.length;
}

const FACE_NORMAL: Readonly<Record<Exclude<SignFace, 'roof'>, readonly [number, number]>> = {
  east: [1, 0],
  west: [-1, 0],
  north: [0, 1],
  south: [0, -1],
};

/** Quads for one building sign: one per face (a roof sign is two back-to-back quads facing ±x). */
function buildingSignQuads(sign: BuildingSign, layout: AtlasLayout | null): TextQuad[] {
  const b = hub.buildings.find((x) => x.id === sign.building);
  if (!b) return [];
  const out: TextQuad[] = [];
  const faces: (readonly [number, number])[] = sign.faces.flatMap((f) => (f === 'roof' ? [FACE_NORMAL.east, FACE_NORMAL.west] : [FACE_NORMAL[f]]));
  for (const [nx, nz] of faces) {
    const roof = sign.faces.includes('roof');
    const faceWidth = nx !== 0 ? b.depth : b.width;
    let h = sign.letterHeight * LINE;
    let w = textWidth(layout, sign.text, sign.letterHeight);
    // Never wider than the face it sits on.
    const max = faceWidth * 0.9;
    if (w > max) {
      h *= max / w;
      w = max;
    }
    const off = roof ? 0.12 : 0.18;
    const cx = b.x + nx * (roof ? off : b.width / 2 + off);
    const cz = b.z + nz * (roof ? off : b.depth / 2 + off);
    out.push({ c: [cx, sign.y, cz], right: rightOf(nx, nz), up: UP, w, h, text: sign.text });
  }
  return out;
}

/** Every vertical text quad: buildings, gantries, direction signs, the pylon and the booths. */
export function signQuads(plan: SitePlan, layout: AtlasLayout | null): readonly TextQuad[] {
  const out: TextQuad[] = buildingSigns.flatMap((s) => buildingSignQuads(s, layout));
  for (const g of plan.gantries) {
    // Faces oncoming traffic: outward normal points back along the road.
    const nx = -Math.cos(g.heading);
    const nz = -Math.sin(g.heading);
    const h = 0.8 * LINE;
    const w = Math.min(textWidth(layout, g.text, 0.8), g.span + 6);
    out.push({ c: [g.x + nx * 0.2, g.clearance + 1.1, g.z + nz * 0.2], right: rightOf(nx, nz), up: UP, w, h: h * (w / textWidth(layout, g.text, 0.8)), text: g.text });
  }
  for (const s of plan.directionSigns) {
    const nx = Math.cos(s.heading);
    const nz = Math.sin(s.heading);
    s.lines.forEach((line, i) => {
      out.push({ c: [s.x + nx * 0.08, 2.6 - i * 0.6, s.z + nz * 0.08], right: rightOf(nx, nz), up: UP, w: textWidth(layout, line, 0.36), h: 0.36 * LINE, text: line });
    });
  }
  // The pylon reads bottom to top on both faces (B-2).
  const p = plan.pylon;
  for (const side of [1, -1]) {
    const nx = Math.cos(p.heading + Math.PI / 2) * side;
    const nz = Math.sin(p.heading + Math.PI / 2) * side;
    const h = 1.1 * LINE;
    const w = Math.min(textWidth(layout, PYLON_TEXT, 1.1), 9.5);
    const [rx, , rz] = rightOf(nx, nz);
    out.push({ c: [p.x + nx * 0.42, 6.6, p.z + nz * 0.42], right: UP, up: [-rx, 0, -rz], w, h, text: PYLON_TEXT });
  }
  for (const b of plan.booths) {
    for (const side of [1, -1]) {
      const nx = Math.cos(b.pose.heading) * side;
      const nz = Math.sin(b.pose.heading) * side;
      out.push({ c: [b.pose.x + nx * 1.32, 3.05, b.pose.z + nz * 1.32], right: rightOf(nx, nz), up: UP, w: Math.min(textWidth(layout, SECURITY_TEXT, 0.22), 2.3), h: 0.22 * LINE, text: SECURITY_TEXT });
    }
  }
  return out;
}

/** Painted road text (B-3): flat quads reading in the driving direction. */
export function groundQuads(plan: SitePlan, layout: AtlasLayout | null): readonly TextQuad[] {
  return plan.groundText.map((t) => {
    const fx = Math.cos(t.heading);
    const fz = Math.sin(t.heading);
    // Long letters, as painted on real roads: stretched along the lane.
    const h = 2.4;
    const w = Math.min(textWidth(layout, t.text, 0.7), 3);
    return { c: [t.x, 0.07, t.z], right: [-fz, 0, fx], up: [fx, 0, fz], w, h, text: t.text };
  });
}

/** Merges text quads into one geometry with UVs into the atlas (missing text → the whole atlas row 0). */
export function quadGeometry(quads: readonly TextQuad[], layout: AtlasLayout | null): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const q of quads) {
    const r = layout?.rects.get(q.text) ?? { u0: 0, v0: 0, u1: 0, v1: 0 };
    const [cx, cy, cz] = q.c;
    const corner = (sx: number, sy: number): V3 => [
      cx + q.right[0] * (sx * q.w) / 2 + q.up[0] * (sy * q.h) / 2,
      cy + q.right[1] * (sx * q.w) / 2 + q.up[1] * (sy * q.h) / 2,
      cz + q.right[2] * (sx * q.w) / 2 + q.up[2] * (sy * q.h) / 2,
    ];
    const bl = corner(-1, -1);
    const br = corner(1, -1);
    const tr = corner(1, 1);
    const tl = corner(-1, 1);
    // Normal = right × up.
    const n: V3 = [
      q.right[1] * q.up[2] - q.right[2] * q.up[1],
      q.right[2] * q.up[0] - q.right[0] * q.up[2],
      q.right[0] * q.up[1] - q.right[1] * q.up[0],
    ];
    for (const [p, u, v] of [
      [bl, r.u0, r.v0],
      [br, r.u1, r.v0],
      [tr, r.u1, r.v1],
      [bl, r.u0, r.v0],
      [tr, r.u1, r.v1],
      [tl, r.u0, r.v1],
    ] as const) {
      pos.push(...p);
      nor.push(...n);
      uv.push(u, v);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}
