import { describe, expect, it } from 'vitest';
import { ATLAS_PAD, packAtlas, type AtlasEntry } from '../../../../src/render/text/atlas';

// Architecture §18, G2: shelf packing of sign strings into one texture.

const measure = (text: string, px: number): number => Math.round(text.length * px * 0.6);
const entries: AtlasEntry[] = [
  { text: 'GoldLane Rentals', px: 128 },
  { text: 'Rental Car Return', px: 64 },
  { text: 'Express Wash', px: 64 },
  { text: 'Fuel', px: 64 },
  { text: 'RETURN', px: 96 },
  { text: 'SLOW', px: 96 },
  { text: 'Fuel', px: 64 },
];

describe('packAtlas', () => {
  const layout = packAtlas(entries, measure, 1024);

  it('has one rect per distinct text, with a power-of-two height', () => {
    expect([...layout.rects.keys()].sort()).toEqual(['Express Wash', 'Fuel', 'GoldLane Rentals', 'RETURN', 'Rental Car Return', 'SLOW']);
    expect(layout.width).toBe(1024);
    expect(Math.log2(layout.height) % 1).toBe(0);
  });

  it('keeps every rect inside [0, 1] with the measured size', () => {
    for (const [text, r] of layout.rects) {
      for (const v of [r.u0, r.u1, r.v0, r.v1]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(r.u1).toBeGreaterThan(r.u0);
      expect(r.v1).toBeGreaterThan(r.v0);
      const px = entries.find((e) => e.text === text)!.px;
      expect(r.w).toBe(measure(text, px));
      expect(r.h).toBe(px);
      expect((r.u1 - r.u0) * layout.width).toBeCloseTo(r.w, 3);
      expect((r.v1 - r.v0) * layout.height).toBeCloseTo(r.h, 3);
    }
  });

  it('never overlaps two rects, padding included', () => {
    const boxes = [...layout.rects.values()].map((r) => ({
      x0: r.u0 * layout.width - ATLAS_PAD / 2,
      x1: r.u1 * layout.width + ATLAS_PAD / 2,
      y0: r.v0 * layout.height - ATLAS_PAD / 2,
      y1: r.v1 * layout.height + ATLAS_PAD / 2,
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
        expect(overlap).toBe(false);
      }
    }
  });

  it('is deterministic regardless of input order', () => {
    const reversed = packAtlas([...entries].reverse(), measure, 1024);
    expect([...reversed.rects.entries()].sort()).toEqual([...layout.rects.entries()].sort());
  });

  it('throws when one entry is wider than the atlas', () => {
    expect(() => packAtlas([{ text: 'x'.repeat(100), px: 128 }], measure, 1024)).toThrow();
  });
});
