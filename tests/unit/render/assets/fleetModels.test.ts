import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BoxGeometry, Float32BufferAttribute, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { brand } from '../../../../src/config/brand';
import { FLEET_CLASSES, FLEET_CLASS_ORDER } from '../../../../src/config/fleet';
import {
  checkModelContract,
  decodeFleetModel,
  GLASS_SENTINEL,
  LIVERY_SENTINEL,
  loadFleetModels,
  lodForTier,
  TRIANGLE_BUDGET,
  type FleetModel,
  type Lod,
} from '../../../../src/render/assets/fleetModels';
import { vehicleAsset, type VehicleAsset } from '../../../../src/render/assets/vehicles';
import { assemble, paint, place, triangleCount } from '../../../../src/render/kit/assemble';
import { darkPalette, lightPalette } from '../../../../src/render/palette';
import type { VehicleClass } from '../../../../src/sim/types';
import { colours, extent, rgb } from '../kit/helpers';

// M10 Blender car models (requirements §15, architecture §23.3, §23.8).

const MODELS = resolve('src/render/assets/models');
const LODS: readonly Lod[] = [0, 1];
/** The tyre colour every model shares with the procedural cars (vehicles.ts TYRE). */
const TYRE = '#1C1D22';

interface ManifestLod {
  readonly triangles: number;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}
type Manifest = Readonly<Record<VehicleClass, Readonly<Record<'lod0' | 'lod1', ManifestLod>>>>;

const bytesOf = (cls: VehicleClass): Uint8Array => new Uint8Array(readFileSync(resolve(MODELS, `${cls}.glb`)));
const dataUri = (cls: VehicleClass): string => `data:model/gltf-binary;base64,${readFileSync(resolve(MODELS, `${cls}.glb`)).toString('base64')}`;
const parts = (a: VehicleAsset): BufferGeometry[] => [a.paint, a.trim, a.lamps];
const tris = (a: VehicleAsset): number => parts(a).reduce((n, g) => n + triangleCount(g), 0);
const near = (c: readonly number[], hex: string, tol = 1 / 255): boolean => {
  const t = rgb(hex);
  return c.every((v, i) => Math.abs(v - (t[i] ?? 0)) <= tol);
};
const hasColour = (g: BufferGeometry, hex: string): boolean => colours(g).some((c) => near(c, hex));

/**
 * A conforming synthetic model: a box car filling the class footprint at LOD1, and the same car with every
 * triangle doubled at LOD0. (Stage 4 fix: the procedural car has ~2,000 triangles, over the LOD1 budget.)
 */
function syntheticModel(cls: VehicleClass): FleetModel {
  const { length: l, width: w } = FLEET_CLASSES[cls];
  const part = (sx: number, sy: number, sz: number, colour: string, x: number, y: number, z = 0): BufferGeometry =>
    place(paint(new BoxGeometry(sx, sy, sz), colour), { x, y, z });
  const low: VehicleAsset = {
    paint: assemble([part(l - 0.2, 0.7, w * 0.9, '#FFFFFF', 0, 0.6), part(l * 0.5, 0.5, w * 0.8, '#FFFFFF', -0.1, 1.2)]),
    trim: assemble([
      ...[1, -1].flatMap((sx) => [1, -1].map((sz) => part(0.6, 0.6, 0.25, '#1C1D22', sx * l * 0.3, 0.3, sz * (w / 2 - 0.15)))),
      part(0.1, 0.2, w * 0.9, '#3A3D45', l / 2 - 0.05, 0.35),
      part(0.1, 0.2, w * 0.9, '#3A3D45', -l / 2 + 0.05, 0.35),
      part(l * 0.45, 0.4, w * 0.82, darkPalette.glass, -0.1, 1.2),
    ]),
    lamps: assemble([part(0.05, 0.12, 0.3, '#FFF3C4', l / 2 - 0.12, 0.75), part(0.05, 0.12, 0.3, '#E0262B', -l / 2 + 0.12, 0.75)]),
  };
  const double = (g: BufferGeometry): BufferGeometry => mergeGeometries([g.clone(), g.clone()]);
  return { lods: { 0: { paint: double(low.paint), trim: double(low.trim), lamps: double(low.lamps) }, 1: low } };
}

/** Returns a copy of `model` with `edit` applied to a clone of one LOD. */
function broken(model: FleetModel, lod: Lod, edit: (a: VehicleAsset) => VehicleAsset): FleetModel {
  const a = model.lods[lod];
  const copy = edit({ paint: a.paint.clone(), trim: a.trim.clone(), lamps: a.lamps.clone() });
  return { lods: { ...model.lods, [lod]: copy } };
}

const setColour = (g: BufferGeometry, i: number, hex: string): BufferGeometry => {
  const [r, gr, b] = rgb(hex);
  g.getAttribute('color').setXYZ(i, r, gr, b);
  return g;
};

/** A minimal GLB container around a glTF JSON document (no binary chunk). */
function glb(json: object): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += ' ';
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(12 + 8 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(body, 20);
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lodForTier (BM-14, M10-9)', () => {
  it('uses LOD0 on tiers 0 and 1 and LOD1 on tier 2', () => {
    expect(lodForTier(0)).toBe(0);
    expect(lodForTier(1)).toBe(0);
    expect(lodForTier(2)).toBe(1);
  });
});

describe('checkModelContract on synthetic models (BM-4…BM-8)', () => {
  const good = syntheticModel('sedan');

  it('accepts a conforming model', () => {
    expect(checkModelContract(good, 'sedan')).toEqual([]);
  });

  const cases: readonly { readonly name: string; readonly rule: string; readonly lod: Lod; readonly edit: (a: VehicleAsset) => VehicleAsset }[] = [
    { name: 'off the ground', rule: 'BM-4', lod: 0, edit: (a) => ({ paint: a.paint.translate(0, 0.1, 0), trim: a.trim.translate(0, 0.1, 0), lamps: a.lamps.translate(0, 0.1, 0) }) },
    { name: 'off centre', rule: 'BM-4', lod: 1, edit: (a) => ({ paint: a.paint.translate(0.3, 0, 0), trim: a.trim.translate(0.3, 0, 0), lamps: a.lamps.translate(0.3, 0, 0) }) },
    { name: 'longer than the footprint', rule: 'BM-5', lod: 0, edit: (a) => ({ paint: a.paint.scale(1.1, 1, 1), trim: a.trim.scale(1.1, 1, 1), lamps: a.lamps.scale(1.1, 1, 1) }) },
    { name: 'wider than the footprint', rule: 'BM-5', lod: 1, edit: (a) => ({ paint: a.paint.scale(1, 1, 1.1), trim: a.trim.scale(1, 1, 1.1), lamps: a.lamps.scale(1, 1, 1.1) }) },
    { name: 'a tinted paint vertex', rule: 'BM-6', lod: 0, edit: (a) => ({ ...a, paint: setColour(a.paint, 0, '#FF0000') }) },
    { name: 'a glass sentinel left in the trim', rule: 'BM-6', lod: 1, edit: (a) => ({ ...a, trim: setColour(a.trim, 0, GLASS_SENTINEL) }) },
    { name: 'a livery sentinel left in the trim', rule: 'BM-6', lod: 0, edit: (a) => ({ ...a, trim: setColour(a.trim, 0, LIVERY_SENTINEL) }) },
    {
      name: 'no taillights',
      rule: 'BM-6',
      lod: 1,
      edit: (a) => {
        const lamps = a.lamps;
        colours(lamps).forEach((c, i) => {
          if (c[0] > 0.5 && c[1] < 0.3) setColour(lamps, i, '#FFF3C4');
        });
        return { ...a, lamps };
      },
    },
    {
      name: 'a part without normals',
      rule: 'BM-6',
      lod: 0,
      edit: (a) => {
        a.trim.deleteAttribute('normal');
        return a;
      },
    },
    {
      name: 'a uv attribute',
      rule: 'BM-7',
      lod: 0,
      edit: (a) => {
        a.paint.setAttribute('uv', new Float32BufferAttribute(new Float32Array(a.paint.getAttribute('position').count * 2), 2));
        return a;
      },
    },
    {
      name: 'over the LOD1 triangle budget',
      rule: 'BM-8',
      lod: 1,
      edit: (a) => {
        let paint = a.paint;
        while (triangleCount(paint) + triangleCount(a.trim) + triangleCount(a.lamps) <= TRIANGLE_BUDGET[1]) paint = mergeGeometries([paint, a.paint.clone()]);
        return { ...a, paint };
      },
    },
  ];

  for (const c of cases) {
    it(`reports ${c.name} as ${c.rule}`, () => {
      const problems = checkModelContract(broken(good, c.lod, c.edit), 'sedan');
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.some((p) => p.startsWith(`${c.rule}:`))).toBe(true);
    });
  }

  it('reports LOD1 that is not lighter than LOD0 as BM-8', () => {
    const low = good.lods[1];
    const problems = checkModelContract({ lods: { 0: low, 1: low } }, 'sedan');
    expect(problems.some((p) => p.startsWith('BM-8:'))).toBe(true);
  });

  it('checks the footprint of the class it is given (BM-5)', () => {
    // The SUV (5.3 × 2.0 m) is bigger than the economy footprint (4.75 × 1.75 m).
    expect(checkModelContract(syntheticModel('suv'), 'economy').some((p) => p.startsWith('BM-5:'))).toBe(true);
  });
});

describe('decodeFleetModel: malformed input (BM-7, BM-13)', () => {
  it('rejects bytes that are not a glTF binary', async () => {
    await expect(decodeFleetModel(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'sedan', darkPalette)).rejects.toThrow();
  });

  it('rejects a model that carries images or textures', async () => {
    const withImage = glb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], images: [{ uri: 'data:image/png;base64,iVBORw0KGgo=' }] });
    await expect(decodeFleetModel(withImage, 'sedan', darkPalette)).rejects.toThrow(/image|texture/i);
  });

  it('rejects a model without LOD0 and LOD1 nodes', async () => {
    const noLods = glb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Body' }] });
    await expect(decodeFleetModel(noLods, 'sedan', darkPalette)).rejects.toThrow(/LOD/);
  });
});

describe('committed models (BM-2…BM-11, M10-10)', () => {
  const manifest = (): Manifest => JSON.parse(readFileSync(resolve(MODELS, 'manifest.json'), 'utf8')) as Manifest;

  it('has a manifest entry for every fleet class and nothing else', () => {
    expect(Object.keys(manifest()).sort()).toEqual([...FLEET_CLASS_ORDER].sort());
  });

  for (const cls of FLEET_CLASS_ORDER) {
    describe(cls, () => {
      it('decodes and meets the model contract', async () => {
        const model = await decodeFleetModel(bytesOf(cls), cls, darkPalette);
        expect(checkModelContract(model, cls)).toEqual([]);
      });

      it('matches the manifest written when it was generated (M10-10)', async () => {
        const model = await decodeFleetModel(bytesOf(cls), cls, darkPalette);
        for (const lod of LODS) {
          const entry = manifest()[cls][lod === 0 ? 'lod0' : 'lod1'];
          const a = model.lods[lod];
          const e = extent(...parts(a));
          expect(tris(a)).toBe(entry.triangles);
          // Bounds survive 14-bit position quantisation to within a few millimetres.
          for (let i = 0; i < 3; i++) {
            expect(e.min.toArray()[i]).toBeCloseTo(entry.min[i] ?? NaN, 2);
            expect(e.max.toArray()[i]).toBeCloseTo(entry.max[i] ?? NaN, 2);
          }
        }
      });

      it('stays within ±10% of the procedural car’s height at both LODs (BM-5)', async () => {
        const model = await decodeFleetModel(bytesOf(cls), cls, darkPalette);
        const procedural = extent(...parts(vehicleAsset(cls, darkPalette))).size.y;
        for (const lod of LODS) {
          const h = extent(...parts(model.lods[lod])).size.y;
          expect(h).toBeGreaterThanOrEqual(0.9 * procedural);
          expect(h).toBeLessThanOrEqual(1.1 * procedural);
        }
      });

      it('respects the triangle budgets, with LOD1 lighter than LOD0 (BM-8)', async () => {
        const model = await decodeFleetModel(bytesOf(cls), cls, darkPalette);
        expect(tris(model.lods[0])).toBeLessThanOrEqual(TRIANGLE_BUDGET[0]);
        expect(tris(model.lods[1])).toBeLessThanOrEqual(TRIANGLE_BUDGET[1]);
        expect(tris(model.lods[1])).toBeLessThan(tris(model.lods[0]));
      });

      it('replaces the sentinels with the palette glass and the brand gold, at both LODs (M10-3, BM-11)', async () => {
        for (const palette of [darkPalette, lightPalette]) {
          const model = await decodeFleetModel(bytesOf(cls), cls, palette);
          for (const lod of LODS) {
            const trim = model.lods[lod].trim;
            expect(hasColour(trim, palette.glass)).toBe(true);
            expect(hasColour(trim, brand.colors.accent)).toBe(true);
            expect(hasColour(trim, GLASS_SENTINEL)).toBe(false);
            expect(hasColour(trim, LIVERY_SENTINEL)).toBe(false);
          }
        }
      });

      it('shares the procedural tyre colour, so colour spaces match (§23.9)', async () => {
        const model = await decodeFleetModel(bytesOf(cls), cls, darkPalette);
        expect(hasColour(model.lods[0].trim, TYRE)).toBe(true);
      });

      it('keeps only position, normal and colour attributes (M10-4, BM-7)', async () => {
        const model = await decodeFleetModel(bytesOf(cls), cls, darkPalette);
        for (const lod of LODS) {
          for (const g of parts(model.lods[lod])) {
            expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'position']);
            expect(g.getAttribute('position').array).toBeInstanceOf(Float32Array);
          }
        }
      });
    });
  }
});

describe('loadFleetModels (BM-13, M10-6)', () => {
  it('loads the committed models for every class by default', async () => {
    const models = await loadFleetModels(darkPalette);
    for (const cls of FLEET_CLASS_ORDER) expect(models.get(cls)).not.toBeNull();
  });

  it('gives a broken class null with one warning naming it, and still loads the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sources: Partial<Record<VehicleClass, string>> = Object.fromEntries(FLEET_CLASS_ORDER.map((c) => [c, dataUri(c)]));
    sources.sedan = 'data:model/gltf-binary;base64,AAAAAAAAAAA=';
    const models = await loadFleetModels(darkPalette, sources);
    expect(models.get('sedan')).toBeNull();
    for (const cls of FLEET_CLASS_ORDER) if (cls !== 'sedan') expect(models.get(cls)).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('sedan');
  });

  it('gives a class with no source null with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const models = await loadFleetModels(darkPalette, { ev: dataUri('ev') });
    expect(models.get('ev')).not.toBeNull();
    expect(models.get('pickup')).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('pickup'))).toBe(true);
  });
});
