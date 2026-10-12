import { notImplemented } from '../shared/notImplemented';
import type { Vec2 } from '../sim/types';
import type { Bounds2D, Pose } from './positions';

// The M5 site plan (requirements §10, architecture §18 G1): every placement around the hub,
// pure and deterministic. Render builds meshes from it; tests check its clearances.

export type Side = 'west' | 'east' | 'north' | 'south';

export interface FenceOpening {
  readonly side: Side;
  /** Along the side: z for west/east, x for north/south. */
  readonly from: number;
  readonly to: number;
}

/** A visual road continuing west of the hub to the edge of the grass ("Airport Blvd" approaches). */
export interface RoadExtension {
  readonly z: number;
  readonly width: number;
  readonly fromX: number;
  readonly toX: number;
}

export interface Gantry {
  /** Centre of the span, over the road's centre line. */
  readonly x: number;
  readonly z: number;
  /** Road direction under the gantry (radians). */
  readonly heading: number;
  /** Clear span between the two legs. */
  readonly span: number;
  /** Height of the sign's underside above the road. */
  readonly clearance: number;
  readonly text: string;
}

export interface DirectionSign {
  readonly x: number;
  readonly z: number;
  /** Direction the sign face looks (towards approaching traffic). */
  readonly heading: number;
  readonly lines: readonly string[];
}

export interface GroundText {
  readonly x: number;
  readonly z: number;
  /** Driving direction: the text reads from this way. */
  readonly heading: number;
  readonly text: 'RETURN' | 'SLOW';
}

export interface Boom {
  readonly id: 'entry' | 'exit';
  /** Pivot of the arm, beside the road. */
  readonly pivot: Vec2;
  /** Road direction the boom guards (radians). */
  readonly heading: number;
  /** Arm length: reaches across the lane. */
  readonly length: number;
}

export interface Booth {
  readonly pose: Pose;
  readonly boom: Boom;
}

export type PropKind = 'barrier' | 'planter' | 'bench' | 'shelter' | 'bin';

export interface Prop {
  readonly kind: PropKind;
  readonly pose: Pose;
}

export interface SitePlan {
  readonly fence: { readonly rect: Bounds2D; readonly openings: readonly FenceOpening[] };
  readonly roadExtensions: readonly RoadExtension[];
  /** Closed loop (the last point joins the first), outside the fence. */
  readonly patrolLoop: readonly Vec2[];
  readonly gantries: readonly Gantry[];
  readonly directionSigns: readonly DirectionSign[];
  readonly groundText: readonly GroundText[];
  readonly pylon: Pose;
  readonly flags: readonly Pose[];
  readonly booths: readonly Booth[];
  readonly cctv: readonly Pose[];
  readonly callBoxes: readonly Pose[];
  readonly bollards: readonly Vec2[];
  readonly props: readonly Prop[];
}

/** Fence distance outside the hub's roads (G1). */
export const FENCE_MARGIN = 14;
/** Patrol loop distance outside the hub's roads. */
export const PATROL_MARGIN = 26;
export const GANTRY_CLEARANCE = 5.5;

/** The site plan, computed once and cached. */
export function sitePlan(): SitePlan {
  return notImplemented();
}
