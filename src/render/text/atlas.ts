import type { Texture } from 'three';
import { notImplemented } from '../../shared/notImplemented';

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
  return notImplemented(entries, measure, width);
}

export interface TextAtlas {
  readonly texture: Texture;
  readonly layout: AtlasLayout;
}

/** Draws the entries onto a canvas (system bold sans-serif, white on transparent); null without a 2D canvas. */
export function createTextAtlas(entries: readonly AtlasEntry[]): TextAtlas | null {
  return notImplemented(entries);
}
