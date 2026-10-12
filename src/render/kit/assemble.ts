import { BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface Placement {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  /** Radians. */
  readonly rotX?: number;
  readonly rotY?: number;
  readonly rotZ?: number;
  readonly scale?: number | readonly [number, number, number];
}

/** Adds a uniform vertex colour (three's working colour space, like Color.set). Returns the same geometry. */
export function paint(geometry: BufferGeometry, colour: string): BufferGeometry {
  const c = new Color(colour);
  const n = geometry.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    data[i * 3] = c.r;
    data[i * 3 + 1] = c.g;
    data[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(data, 3));
  return geometry;
}

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scaleVec = new Vector3();
const euler = new Euler();

/** Applies scale, then rotation (X, Y, Z order), then translation. Returns the same geometry. */
export function place(geometry: BufferGeometry, p: Placement): BufferGeometry {
  const s = p.scale ?? 1;
  if (typeof s === 'number') scaleVec.set(s, s, s);
  else scaleVec.set(s[0], s[1], s[2]);
  quaternion.setFromEuler(euler.set(p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0, 'XYZ'));
  position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  geometry.applyMatrix4(matrix.compose(position, quaternion, scaleVec));
  return geometry;
}

/**
 * Merges painted parts into one non-indexed geometry with position, normal and color (P1).
 * Throws if any part has no colour, or the list is empty.
 */
export function assemble(parts: readonly BufferGeometry[]): BufferGeometry {
  if (parts.length === 0) throw new Error('assemble() needs at least one part');
  const clean = parts.map((part) => {
    if (!part.hasAttribute('color')) throw new Error('assemble(): every part must be painted first');
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.hasAttribute('normal')) g.computeVertexNormals();
    const out = new BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    out.setAttribute('normal', g.getAttribute('normal'));
    out.setAttribute('color', g.getAttribute('color'));
    return out;
  });
  const merged = mergeGeometries(clean);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function triangleCount(geometry: BufferGeometry): number {
  return geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
}
