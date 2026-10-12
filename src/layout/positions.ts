import { hub, hubGraph, type AreaId, type AreaLayout, type UnitLayout } from './hub';

export interface Pose {
  readonly x: number;
  readonly z: number;
  /** Radians, atan2(dz, dx). */
  readonly heading: number;
}

export interface Bounds2D {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Half the length of a typical parked car: its centre sits this far back from the spot's end. */
const HALF_CAR = 2.6;

const unitsById = new Map<string, UnitLayout>(Object.values(hub.stations).flatMap((s) => s.units.map((u) => [u.id, u] as const)));

/**
 * Where a clickable unit (bay, charger, kiosk, slot, gate) sits: the centre of a
 * typical car parked with its front at the end of the unit's park edge.
 * Throws on an unknown unit id.
 */
export function unitPose(unitId: string): Pose {
  const unit = unitsById.get(unitId);
  if (!unit) throw new Error(`Unknown unit ${unitId}`);
  const edge = hubGraph().edge(unit.parkEdge);
  const p = edge.path.pointAt(edge.length - HALF_CAR);
  return { x: p.x, z: p.z, heading: edge.path.headingAt(edge.length - 0.1) };
}

/** Distance past the parking spot's front where a unit's equipment marker stands. */
const MARKER_AHEAD = 1.2;

/**
 * The unit's equipment marker (kiosk, charger post, pump, gate post, wash control):
 * just past the front of the parking spot, so clicking it never hits a parked car.
 * Throws on an unknown unit id.
 */
export function unitMarker(unitId: string): Pose {
  const unit = unitsById.get(unitId);
  if (!unit) throw new Error(`Unknown unit ${unitId}`);
  const edge = hubGraph().edge(unit.parkEdge);
  const end = edge.path.pointAt(edge.length);
  const heading = edge.path.headingAt(edge.length - 0.1);
  return { x: end.x + Math.cos(heading) * MARKER_AHEAD, z: end.z + Math.sin(heading) * MARKER_AHEAD, heading };
}

/** Axis-aligned bounds of every lane-graph point, grown by `margin` metres (default 20). */
export function hubBounds(margin = 20): Bounds2D {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const e of hubGraph().edges) {
    for (const p of e.path.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  return { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
}

/** Throws on an unknown area id. */
export function areaById(id: AreaId): AreaLayout {
  const area = hub.areas.find((a) => a.id === id);
  if (!area) throw new Error(`Unknown area ${id}`);
  return area;
}

/**
 * Which area a ground point belongs to, for the fleet table's location column:
 * the nearest non-overview area within 70 m of its centre, otherwise 'overview'.
 */
export function areaOf(x: number, z: number): AreaId {
  let best: AreaId = 'overview';
  let bestDist = AREA_RADIUS;
  for (const a of hub.areas) {
    if (a.id === 'overview') continue;
    const d = Math.hypot(a.x - x, a.z - z);
    if (d <= bestDist) {
      best = a.id;
      bestDist = d;
    }
  }
  return best;
}

const AREA_RADIUS = 70;
