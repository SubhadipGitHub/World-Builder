import type { Vec2 } from '../sim/types';
import { JET_LENGTH, type AircraftPose } from './flights';
import { pointAtDistance, polylineLength } from './paths';
import { airportPlan } from './plan';

// Visual-only airport traffic (requirements F-4, F-5, architecture §19 H6, H13). Pure.
// Every vehicle drives a closed loop at constant speed with fixed spacing, so vehicles on one
// lane can't overlap by construction. Lane ids are per leg of a loop (straight runs).

export interface TrafficVehicle {
  readonly id: string;
  readonly kind: 'car' | 'taxi' | 'bus';
  /** Loop leg the vehicle is on (vehicles on one lane keep TRAFFIC_GAP apart). */
  readonly lane: string;
  readonly x: number;
  /** Road height (the boulevard deck is elevated). */
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
}

export interface ServiceVehicle {
  readonly id: string;
  readonly kind: 'tug' | 'fuel' | 'followMe';
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/** Bumper-to-bumper spacing along a lane (centre to centre). */
export const TRAFFIC_GAP = 40;
export const BUS_DWELL_SEC = 8;
/** Vehicles at full density. */
export const TRAFFIC_COUNT = 28;

interface Loop {
  readonly id: string;
  readonly points: readonly Vec2[];
  readonly y: number;
  readonly speed: number;
  readonly kinds: readonly TrafficVehicle['kind'][];
  /** Bus stops: distances along the loop where buses dwell. */
  readonly stops?: readonly number[];
}

let loops: readonly Loop[] | null = null;

/** The traffic loops, built from the plan once. */
function trafficLoops(): readonly Loop[] {
  if (loops) return loops;
  const plan = airportPlan();
  const bx = plan.boulevard.x;
  const south = plan.boulevard.fromZ;
  const curb = plan.curb;
  const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
    { x: x0, z: z0 },
    { x: x0, z: z1 },
    { x: x1, z: z1 },
    { x: x1, z: z0 },
  ];
  loops = [
    // Boulevard: north on the east lanes, U-turn on the deck, south on the west lanes.
    { id: 'blvd-outer', points: rect(bx + 7, south, bx - 7, 190), y: plan.boulevard.deckY, speed: 15, kinds: Array<TrafficVehicle['kind']>(12).fill('car') },
    { id: 'blvd-inner', points: rect(bx + 3.5, south, bx - 3.5, 185), y: plan.boulevard.deckY, speed: 13, kinds: Array<TrafficVehicle['kind']>(8).fill('car') },
    // Terminal curb: a ring in front of the terminal; half the vehicles are taxis.
    { id: 'curb', points: rect(curb.fromX - 10, curb.z - 4, curb.toX + 10, curb.z + 8), y: 0, speed: 8, kinds: ['taxi', 'car', 'taxi', 'car', 'taxi', 'car'] },
    // Bus bay with two stops a third and two thirds along its curb-side leg (after the 4 m first leg).
    {
      id: 'bus',
      points: rect(curb.fromX, curb.z - 14, curb.toX, curb.z - 10),
      y: 0,
      speed: 7,
      kinds: ['bus', 'bus'],
      stops: [4 + (curb.toX - curb.fromX) / 3, 4 + (2 * (curb.toX - curb.fromX)) / 3],
    },
  ];
  return loops;
}

/** Distance along a loop at time t for a vehicle starting at s0, with dwells at stops. */
function travelled(loop: Loop, length: number, s0: number, t: number): number {
  const stops = loop.stops ?? [];
  if (stops.length === 0) return s0 + loop.speed * t;
  // One lap takes the driving time plus a dwell per stop; walk the lap piecewise.
  const lap = length / loop.speed + stops.length * BUS_DWELL_SEC;
  const laps = Math.floor((t + s0 / loop.speed) / lap);
  let rem = t + s0 / loop.speed - laps * lap;
  let s = 0;
  for (const stop of [...stops].sort((a, b) => a - b)) {
    const drive = (stop - s) / loop.speed;
    if (rem <= drive) return laps * length + s + rem * loop.speed;
    rem -= drive;
    s = stop;
    if (rem <= BUS_DWELL_SEC) return laps * length + s;
    rem -= BUS_DWELL_SEC;
  }
  return laps * length + s + rem * loop.speed;
}

/** Which straight leg of a rectangle loop a distance falls on. */
function legOf(points: readonly Vec2[], s: number, length: number): number {
  let d = ((s % length) + length) % length;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Vec2;
    const b = points[(i + 1) % points.length] as Vec2;
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < l) return i;
    d -= l;
  }
  return points.length - 1;
}

/** Background traffic at airport time t; density 1 full, 0.5 half, 0 none. */
export function trafficAt(t: number, density: number): readonly TrafficVehicle[] {
  if (density <= 0) return [];
  const out: TrafficVehicle[] = [];
  for (const loop of trafficLoops()) {
    const length = polylineLength(loop.points, true);
    const n = loop.kinds.length;
    loop.kinds.forEach((kind, i) => {
      if (density < 1 && i % 2 === 1) return;
      const s = travelled(loop, length, (i * length) / n, t);
      const p = pointAtDistance(loop.points, s, true);
      const dwelling = (loop.stops?.length ?? 0) > 0 && Math.abs(travelled(loop, length, (i * length) / n, t + 0.05) - s) < 1e-9;
      out.push({ id: `${loop.id}-${String(i)}`, kind, lane: `${loop.id}-${String(legOf(loop.points, s, length))}`, x: p.x, y: loop.y, z: p.z, heading: p.heading, speed: dwelling ? 0 : loop.speed });
    });
  }
  return out;
}

/** Pushback tug (at the nose of a jet in pushback), fuel truck and follow-me car. */
export function serviceVehiclesAt(t: number, aircraft: readonly AircraftPose[]): readonly ServiceVehicle[] {
  const plan = airportPlan();
  const out: ServiceVehicle[] = aircraft
    .filter((a) => a.phase === 'pushback')
    .map((a) => ({
      id: `tug-${a.id}`,
      kind: 'tug' as const,
      x: a.x + Math.cos(a.heading) * (JET_LENGTH / 2 + 3),
      z: a.z + Math.sin(a.heading) * (JET_LENGTH / 2 + 3),
      heading: a.heading + Math.PI,
    }));
  // Fuel truck: between the apron's east end and the fuel farm, south of the tower.
  const fuelLoop: Vec2[] = [
    { x: plan.apron.maxX + 5, z: plan.apron.minZ - 4 },
    { x: 405, z: plan.apron.minZ - 4 },
    { x: 405, z: plan.apron.minZ - 10 },
    { x: plan.apron.maxX + 5, z: plan.apron.minZ - 10 },
  ];
  const f = pointAtDistance(fuelLoop, 6 * t, true);
  out.push({ id: 'fuel-1', kind: 'fuel', x: f.x, z: f.z, heading: f.heading });
  // Follow-me car: the perimeter road north of the runway.
  const north = plan.runway.z + plan.runway.width / 2 + 10;
  const perimeter: Vec2[] = [
    { x: plan.taxiway.fromX, z: north },
    { x: plan.taxiway.toX, z: north },
    { x: plan.taxiway.toX, z: north + 6 },
    { x: plan.taxiway.fromX, z: north + 6 },
  ];
  const m = pointAtDistance(perimeter, 9 * t, true);
  out.push({ id: 'follow-me', kind: 'followMe', x: m.x, z: m.z, heading: m.heading });
  return out;
}

export interface AirportDetail {
  /** Aircraft move (false: parked only). */
  readonly flights: boolean;
  readonly traffic: number;
  readonly vehicles: boolean;
  /** Beacon rotation, strobes and flashing lights (steady when false). */
  readonly lightAnim: boolean;
}

/** Detail per quality tier (§11.6); reduced motion stops light animation only (§11.7). */
export function airportDetail(tier: number, reducedMotion: boolean): AirportDetail {
  const base: AirportDetail =
    tier <= 0
      ? { flights: true, traffic: 1, vehicles: true, lightAnim: true }
      : tier === 1
        ? { flights: true, traffic: 0.5, vehicles: false, lightAnim: true }
        : { flights: false, traffic: 0, vehicles: false, lightAnim: false };
  return reducedMotion ? { ...base, lightAnim: false } : base;
}
