/** Oriented 2-D footprint of an agent on the ground plane. */
export interface Footprint {
  readonly id: string;
  /** Centre. */
  readonly x: number;
  readonly z: number;
  /** Radians; length runs along the heading. */
  readonly heading: number;
  readonly length: number;
  readonly width: number;
  /** Set on a vehicle being towed; parent and child never count as overlapping. */
  readonly parentId?: string;
}

const EPS = 1e-9;

interface Axis {
  readonly x: number;
  readonly z: number;
}

/** Half-extent of a footprint projected onto an axis, plus its centre's projection. */
function project(f: Footprint, axis: Axis): { c: number; r: number } {
  const cos = Math.cos(f.heading);
  const sin = Math.sin(f.heading);
  const along = Math.abs(cos * axis.x + sin * axis.z) * (f.length / 2);
  const across = Math.abs(-sin * axis.x + cos * axis.z) * (f.width / 2);
  return { c: f.x * axis.x + f.z * axis.z, r: along + across };
}

const axesOf = (f: Footprint): Axis[] => {
  const cos = Math.cos(f.heading);
  const sin = Math.sin(f.heading);
  return [
    { x: cos, z: sin },
    { x: -sin, z: cos },
  ];
};

/** Separating-axis test. Touching edges do not count as overlap. */
export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const pa = project(a, axis);
    const pb = project(b, axis);
    if (pa.r + pb.r - Math.abs(pa.c - pb.c) <= EPS) return false;
  }
  return true;
}

const related = (a: Footprint, b: Footprint): boolean => a.parentId === b.id || b.parentId === a.id;

/** Every overlapping pair (ids sorted within and across pairs). Must match a brute-force check. */
export function findOverlaps(footprints: readonly Footprint[]): readonly (readonly [string, string])[] {
  if (footprints.length < 2) return [];
  const radius = (f: Footprint): number => Math.hypot(f.length, f.width) / 2;
  const cell = Math.max(4, ...footprints.map((f) => 2 * radius(f)));
  const grid = new Map<string, number[]>();
  footprints.forEach((f, i) => {
    const r = radius(f);
    for (let gx = Math.floor((f.x - r) / cell); gx <= Math.floor((f.x + r) / cell); gx++) {
      for (let gz = Math.floor((f.z - r) / cell); gz <= Math.floor((f.z + r) / cell); gz++) {
        const key = `${String(gx)},${String(gz)}`;
        const list = grid.get(key);
        if (list) list.push(i);
        else grid.set(key, [i]);
      }
    }
  });

  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = footprints[list[i] as number] as Footprint;
        const b = footprints[list[j] as number] as Footprint;
        const pair: [string, string] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        const key = `${pair[0]}\u0000${pair[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!related(a, b) && footprintsOverlap(a, b)) pairs.push(pair);
      }
    }
  }
  return pairs.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
}

export interface MotionSample {
  readonly id: string;
  readonly speed: number;
  /** Stationary by design (working at a resource, parked, waiting for a customer). */
  readonly parked: boolean;
}

export interface GridlockDetector {
  /** Returns ids that have been stationary and not parked for longer than the limit. */
  update(samples: readonly MotionSample[], nowSimSec: number): readonly string[];
}

const STATIONARY = 0.05;

export function createGridlockDetector(limitSimSec: number): GridlockDetector {
  const since = new Map<string, number>();
  return {
    update(samples, nowSimSec) {
      const present = new Set<string>();
      const stuck: string[] = [];
      for (const s of samples) {
        present.add(s.id);
        if (s.parked || s.speed > STATIONARY) {
          since.delete(s.id);
          continue;
        }
        const start = since.get(s.id);
        if (start === undefined) since.set(s.id, nowSimSec);
        else if (nowSimSec - start > limitSimSec) stuck.push(s.id);
      }
      for (const id of [...since.keys()]) if (!present.has(id)) since.delete(id);
      return stuck.sort();
    },
  };
}
