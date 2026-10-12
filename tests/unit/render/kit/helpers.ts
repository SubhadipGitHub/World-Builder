import { Box3, Color, Vector3, type BufferGeometry } from 'three';

export interface Extent {
  readonly min: Vector3;
  readonly max: Vector3;
  readonly size: Vector3;
  readonly center: Vector3;
}

/** Bounding box of one or more geometries together. */
export function extent(...geometries: readonly BufferGeometry[]): Extent {
  const box = new Box3();
  for (const g of geometries) {
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
  }
  return { min: box.min.clone(), max: box.max.clone(), size: box.getSize(new Vector3()), center: box.getCenter(new Vector3()) };
}

/** Every vertex colour of a geometry as [r, g, b] in three's working space. */
export function colours(g: BufferGeometry): [number, number, number][] {
  const c = g.getAttribute('color');
  const out: [number, number, number][] = [];
  for (let i = 0; i < c.count; i++) out.push([c.getX(i), c.getY(i), c.getZ(i)]);
  return out;
}

export const rgb = (hex: string): [number, number, number] => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

/** Vertex positions as [x, y, z]. */
export function positions(g: BufferGeometry): [number, number, number][] {
  const p = g.getAttribute('position');
  const out: [number, number, number][] = [];
  for (let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
  return out;
}
