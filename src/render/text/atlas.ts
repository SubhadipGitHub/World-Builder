import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

// Runtime text atlas for signs (architecture §18, G2). No font or image files (W-1).

export interface AtlasEntry {
  readonly text: string;
  /** Pixel height of the line (cap height scales with it). */
  readonly px: number;
}

export interface AtlasRect {
  /** UVs in [0, 1]; v0 is the bottom edge (three.js convention). */
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  /** Pixel size, for the sign's aspect ratio. */
  readonly w: number;
  readonly h: number;
}

export interface AtlasLayout {
  readonly width: number;
  readonly height: number;
  /** Keyed by text; duplicates share one rect. */
  readonly rects: ReadonlyMap<string, AtlasRect>;
}

/** Measures a line's pixel width at a pixel height (injected so packing is testable). */
export type Measure = (text: string, px: number) => number;

/** Padding around every entry, in pixels. */
export const ATLAS_PAD = 8;

/**
 * Shelf packing (pure): entries sorted by height (then text, for determinism), placed left to right
 * in shelves of `width` pixels. The height is the next power of two that fits. Throws if one entry
 * is wider than the atlas.
 */
export function packAtlas(entries: readonly AtlasEntry[], measure: Measure, width: number): AtlasLayout {
  const unique = new Map<string, AtlasEntry>();
  for (const e of entries) {
    const prev = unique.get(e.text);
    if (!prev || e.px > prev.px) unique.set(e.text, e);
  }
  const sorted = [...unique.values()].sort((a, b) => b.px - a.px || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  const placed: { text: string; x: number; y: number; w: number; h: number }[] = [];
  let x = ATLAS_PAD / 2;
  let y = ATLAS_PAD / 2;
  let shelf = 0;
  for (const e of sorted) {
    const w = measure(e.text, e.px);
    if (w + ATLAS_PAD > width) throw new Error(`"${e.text}" is wider than the ${String(width)} px atlas`);
    if (x + w + ATLAS_PAD / 2 > width) {
      x = ATLAS_PAD / 2;
      y += shelf + ATLAS_PAD;
      shelf = 0;
    }
    placed.push({ text: e.text, x, y, w, h: e.px });
    x += w + ATLAS_PAD;
    shelf = Math.max(shelf, e.px);
  }
  const used = y + shelf + ATLAS_PAD / 2;
  let height = 1;
  while (height < used) height *= 2;
  const rects = new Map<string, AtlasRect>();
  for (const p of placed) {
    rects.set(p.text, { u0: p.x / width, u1: (p.x + p.w) / width, v0: 1 - (p.y + p.h) / height, v1: 1 - p.y / height, w: p.w, h: p.h });
  }
  return { width, height, rects };
}

export interface TextAtlas {
  readonly texture: Texture;
  readonly layout: AtlasLayout;
}

export const ATLAS_WIDTH = 2048;
const FONT = (px: number): string => `700 ${String(Math.round(px * 0.8))}px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;

/** Draws the entries onto a canvas (system bold sans-serif, white on transparent); null without a 2D canvas. */
export function createTextAtlas(entries: readonly AtlasEntry[]): TextAtlas | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const measure: Measure = (text, px) => {
    ctx.font = FONT(px);
    return Math.ceil(ctx.measureText(text).width) + 2;
  };
  const layout = packAtlas(entries, measure, ATLAS_WIDTH);
  canvas.width = layout.width;
  canvas.height = layout.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  for (const [text, r] of layout.rects) {
    ctx.font = FONT(r.h);
    ctx.fillText(text, r.u0 * layout.width + 1, (1 - r.v1) * layout.height + r.h / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, layout };
}
