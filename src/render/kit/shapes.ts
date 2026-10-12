import { BoxGeometry, CapsuleGeometry, CylinderGeometry, IcosahedronGeometry, LatheGeometry, Vector2, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Vec2 } from '../../sim/types';

/**
 * Shape vocabulary for the Pixar-style asset kit (architecture §16, P3). Every function returns a
 * non-indexed BufferGeometry with positions and normals, centred on the origin unless stated.
 */

const flat = (g: BufferGeometry): BufferGeometry => {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute('uv');
  if (!out.hasAttribute('normal')) out.computeVertexNormals();
  return out;
};

/** Box with rounded edges; bounding box exactly w × h × d. `segments` 1–4 (default 2). */
export function roundedBox(w: number, h: number, d: number, radius: number, segments = 2): BufferGeometry {
  const r = Math.max(0.001, Math.min(radius, (Math.min(w, h, d) / 2) * 0.98));
  return flat(new RoundedBoxGeometry(w, h, d, Math.min(4, Math.max(1, Math.round(segments))), r));
}

/** Capsule along the y axis: total height = length + 2 × radius. */
export function capsule(radius: number, length: number, radialSegments = 8): BufferGeometry {
  return flat(new CapsuleGeometry(radius, length, 3, radialSegments));
}

/** Cylinder along the y axis, height h. */
export function cylinder(radiusTop: number, radiusBottom: number, h: number, radialSegments = 10): BufferGeometry {
  return flat(new CylinderGeometry(radiusTop, radiusBottom, h, radialSegments));
}

/** Solid of revolution around the y axis from a profile of (radius = x, height = z) points. */
export function lathe(profile: readonly Vec2[], segments = 12): BufferGeometry {
  return flat(new LatheGeometry(profile.map((p) => new Vector2(p.x, p.z)), segments));
}

/** Low-poly sphere (icosahedron), radius r. */
export function blob(radius: number, detail = 1): BufferGeometry {
  return flat(new IcosahedronGeometry(radius, detail));
}

/** Plain box (12 triangles), for decals and thin panels where rounding would be invisible. */
export function slab(w: number, h: number, d: number): BufferGeometry {
  return flat(new BoxGeometry(w, h, d));
}
