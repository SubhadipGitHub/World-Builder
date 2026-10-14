import { BufferGeometry, Color, Float32BufferAttribute, Matrix3, Mesh, Vector3, type BufferAttribute, type InterleavedBufferAttribute, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { brand } from '../../config/brand';
import { FLEET_CLASSES, FLEET_CLASS_ORDER } from '../../config/fleet';
import type { VehicleClass } from '../../sim/types';
import { triangleCount } from '../kit/assemble';
import type { Palette } from '../palette';
import type { VehicleAsset } from './vehicles';

// M10 Blender car models (requirements §15, architecture §23): decode the committed .glb files into the
// same { paint, trim, lamps } parts the procedural cars use, checked against the model contract.

/** 0 = mid-poly (tiers 0–1), 1 = low-poly (tier 2) (BM-8, M10-9). */
export type Lod = 0 | 1;

export interface FleetModel {
  readonly lods: Readonly<Record<Lod, VehicleAsset>>;
}

/** Trim vertices authored in this colour become `palette.glass` (M10-3). */
export const GLASS_SENTINEL = '#FF00FF';
/** Trim vertices authored in this colour become `brand.colors.accent` (M10-3, D5). */
export const LIVERY_SENTINEL = '#00FFFF';
/** Triangles per class, all three parts together (BM-8). */
export const TRIANGLE_BUDGET: Readonly<Record<Lod, number>> = { 0: 6000, 1: 1500 };

const LODS: readonly Lod[] = [0, 1];
const PARTS = ['paint', 'trim', 'lamps'] as const;
type PartName = (typeof PARTS)[number];
/** Half a step of 8-bit colour quantisation, plus float noise. */
const COLOUR_TOL = 1 / 255 + 1e-4;

/** The committed models as data URIs, by class (BM-2). */
const MODEL_SOURCES: Readonly<Partial<Record<VehicleClass, string>>> = (() => {
  const files = import.meta.glob<string>('./models/*.glb', { query: '?inline', import: 'default', eager: true });
  const out: Partial<Record<VehicleClass, string>> = {};
  for (const [path, uri] of Object.entries(files)) {
    const cls = FLEET_CLASS_ORDER.find((c) => path.endsWith(`/${c}.glb`));
    if (cls) out[cls] = uri;
  }
  return out;
})();

/** The quality tier's LOD: tier 2 uses LOD1, tiers 0 and 1 use LOD0 (BM-14, M10-9). */
export function lodForTier(tier: number): Lod {
  return tier >= 2 ? 1 : 0;
}

const near = (r: number, g: number, b: number, c: Color): boolean => Math.abs(r - c.r) <= COLOUR_TOL && Math.abs(g - c.g) <= COLOUR_TOL && Math.abs(b - c.b) <= COLOUR_TOL;
const GLASS = new Color(GLASS_SENTINEL);
const LIVERY = new Color(LIVERY_SENTINEL);

function bounds(a: VehicleAsset): { min: Vector3; max: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const p = new Vector3();
  for (const g of [a.paint, a.trim, a.lamps]) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      min.min(p);
      max.max(p);
    }
  }
  return { min, max };
}

const trianglesOf = (a: VehicleAsset): number => triangleCount(a.paint) + triangleCount(a.trim) + triangleCount(a.lamps);

/**
 * Every BM-4…BM-8 violation of a decoded model, each message starting with its rule id ("BM-5: …");
 * [] means it conforms. Pure, so it runs on synthetic geometry in tests.
 */
export function checkModelContract(model: FleetModel, cls: VehicleClass): string[] {
  const problems: string[] = [];
  const { length, width } = FLEET_CLASSES[cls];
  for (const lod of LODS) {
    const a = model.lods[lod];
    const tag = `LOD${lod}`;
    const missing = PARTS.filter((name) => {
      const g = a[name];
      return !g.hasAttribute('position') || !g.hasAttribute('normal') || !g.hasAttribute('color') || g.getAttribute('position').count === 0;
    });
    if (missing.length > 0) {
      problems.push(`BM-6: ${tag} ${missing.join(', ')} must be non-empty with position, normal and colour`);
      continue;
    }
    if (PARTS.some((name) => a[name].hasAttribute('uv'))) problems.push(`BM-7: ${tag} has texture coordinates`);

    const { min, max } = bounds(a);
    if (Math.abs(min.y) > 0.02) problems.push(`BM-4: ${tag} lowest point is at y = ${min.y.toFixed(3)}, not on the ground`);
    if (Math.abs((min.x + max.x) / 2) > 0.05 || Math.abs((min.z + max.z) / 2) > 0.05) problems.push(`BM-4: ${tag} is not centred on its footprint`);
    if (max.x - min.x > length + 0.01) problems.push(`BM-5: ${tag} is ${(max.x - min.x).toFixed(3)} m long, over the ${length} m footprint`);
    if (max.z - min.z > width + 0.01) problems.push(`BM-5: ${tag} is ${(max.z - min.z).toFixed(3)} m wide, over the ${width} m footprint`);

    const paint = a.paint.getAttribute('color');
    for (let i = 0; i < paint.count; i++) {
      if (paint.getX(i) < 1 - COLOUR_TOL || paint.getY(i) < 1 - COLOUR_TOL || paint.getZ(i) < 1 - COLOUR_TOL) {
        problems.push(`BM-6: ${tag} paint must be white so each car takes its own colour`);
        break;
      }
    }
    const trim = a.trim.getAttribute('color');
    for (let i = 0; i < trim.count; i++) {
      const [r, g, b] = [trim.getX(i), trim.getY(i), trim.getZ(i)];
      if (near(r, g, b, GLASS) || near(r, g, b, LIVERY)) {
        problems.push(`BM-6: ${tag} trim still has a sentinel colour`);
        break;
      }
    }
    const lamps = a.lamps.getAttribute('color');
    const lampPos = a.lamps.getAttribute('position');
    let headX = 0;
    let heads = 0;
    let tailX = 0;
    let tails = 0;
    for (let i = 0; i < lamps.count; i++) {
      if (lamps.getY(i) > 0.55) {
        headX += lampPos.getX(i);
        heads++;
      } else if (lamps.getX(i) > 0.5 && lamps.getY(i) < 0.3) {
        tailX += lampPos.getX(i);
        tails++;
      }
    }
    if (heads === 0 || headX / heads <= 0) problems.push(`BM-6: ${tag} needs warm headlights at the front (+x)`);
    if (tails === 0 || tailX / tails >= 0) problems.push(`BM-6: ${tag} needs red taillights at the back (−x)`);

    const tris = trianglesOf(a);
    if (tris > TRIANGLE_BUDGET[lod]) problems.push(`BM-8: ${tag} has ${tris} triangles, over its budget of ${TRIANGLE_BUDGET[lod]}`);
  }
  const ready = LODS.every((lod) => PARTS.every((name) => model.lods[lod][name].hasAttribute('position')));
  if (ready && trianglesOf(model.lods[1]) >= trianglesOf(model.lods[0])) problems.push('BM-8: LOD1 must have fewer triangles than LOD0');
  return problems;
}

/** The JSON chunk of a GLB, or a thrown error if the bytes are not a glTF binary. */
function glbJson(bytes: Uint8Array): { images?: unknown[]; textures?: unknown[]; samplers?: unknown[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('not a glTF binary');
  const length = view.getUint32(12, true);
  if (20 + length > bytes.byteLength) throw new Error('truncated glTF binary');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as { images?: unknown[]; textures?: unknown[]; samplers?: unknown[] };
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;

/** One primitive as float position, normal and colour in model space; sentinels replaced (M10-3, M10-4). */
function bake(mesh: Mesh, replace: readonly (readonly [Color, Color])[]): BufferGeometry {
  const src = mesh.geometry;
  const pos = src.getAttribute('position') as Attribute | undefined;
  const nor = src.getAttribute('normal') as Attribute | undefined;
  const col = src.getAttribute('color') as Attribute | undefined;
  // No COLOR_0 means white in glTF; gltfpack drops it from an all-white primitive (the paint).
  if (!pos || !nor) throw new Error(`primitive "${mesh.name}" needs positions and normals`);
  const world = mesh.matrixWorld;
  const normalMatrix = new Matrix3().getNormalMatrix(world);
  const p = new Vector3();
  const positions = new Float32Array(pos.count * 3);
  const normals = new Float32Array(pos.count * 3);
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    p.toArray(positions, i * 3);
    p.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
    p.toArray(normals, i * 3);
    let [r, g, b] = col ? [col.getX(i), col.getY(i), col.getZ(i)] : [1, 1, 1];
    for (const [from, to] of replace) {
      if (near(r, g, b, from)) [r, g, b] = [to.r, to.g, to.b];
    }
    colours.set([r, g, b], i * 3);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new Float32BufferAttribute(colours, 3));
  const index = src.getIndex();
  if (index) out.setIndex(Array.from(index.array));
  return out;
}

function emptyPart(): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of ['position', 'normal', 'color']) g.setAttribute(name, new Float32BufferAttribute([], 3));
  return g;
}

/**
 * Parses one class's .glb (meshopt-compressed, LOD0 and LOD1 root nodes), dequantises, merges by material
 * into the three parts, replaces the sentinels from `palette` and `brand`, and checks the contract.
 * Rejects on a parse failure, images or textures, missing LOD nodes, or any contract violation.
 */
export async function decodeFleetModel(bytes: Uint8Array, cls: VehicleClass, palette: Palette): Promise<FleetModel> {
  const json = glbJson(bytes);
  if ((json.images?.length ?? 0) > 0 || (json.textures?.length ?? 0) > 0 || (json.samplers?.length ?? 0) > 0) throw new Error('model contains images or textures (BM-7)');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(buffer, '');
  gltf.scene.updateMatrixWorld(true);
  const replace = [
    [GLASS, new Color(palette.glass)],
    [LIVERY, new Color(brand.colors.accent)],
  ] as const;
  const lods = {} as Record<Lod, VehicleAsset>;
  for (const lod of LODS) {
    const node = gltf.scene.getObjectByName(`LOD${lod}`);
    if (!node) throw new Error(`model has no LOD${lod} node (M10-1)`);
    const parts: Record<PartName, BufferGeometry[]> = { paint: [], trim: [], lamps: [] };
    node.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const mesh = o as Mesh<BufferGeometry, Material>;
      const name = mesh.material.name;
      if (name !== 'paint' && name !== 'trim' && name !== 'lamps') throw new Error(`unknown material "${name}" (BM-6)`);
      parts[name].push(bake(mesh, name === 'trim' ? replace : []));
    });
    const merge = (list: BufferGeometry[]): BufferGeometry => {
      if (list.length === 0) return emptyPart();
      const merged = list.length === 1 ? list[0] : mergeGeometries(list);
      if (!merged) throw new Error('could not merge primitives');
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      return merged;
    };
    lods[lod] = { paint: merge(parts.paint), trim: merge(parts.trim), lamps: merge(parts.lamps) };
  }
  const model: FleetModel = { lods };
  const problems = checkModelContract(model, cls);
  if (problems.length > 0) throw new Error(problems.join('; '));
  return model;
}

function dataUriBytes(uri: string): Uint8Array {
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || !uri.slice(0, comma).endsWith(';base64')) throw new Error('model source is not a base64 data URI');
  const text = atob(uri.slice(comma + 1));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/**
 * Decodes every fleet class from `sources` (data URIs; defaults to the committed models). Each class
 * settles on its own: a missing, broken or non-conforming model gives `null` and one `console.warn`
 * naming the class (BM-13, M10-6).
 */
export async function loadFleetModels(palette: Palette, sources: Readonly<Partial<Record<VehicleClass, string>>> = MODEL_SOURCES): Promise<Map<VehicleClass, FleetModel | null>> {
  const entries = await Promise.all(
    FLEET_CLASS_ORDER.map(async (cls): Promise<readonly [VehicleClass, FleetModel | null]> => {
      try {
        const uri = sources[cls];
        if (uri === undefined) throw new Error('no model file');
        return [cls, await decodeFleetModel(dataUriBytes(uri), cls, palette)];
      } catch (e) {
        console.warn(`GoldLane: the ${cls} car model could not be used, so it keeps the built-in car (${e instanceof Error ? e.message : String(e)}).`);
        return [cls, null];
      }
    }),
  );
  return new Map(entries);
}
