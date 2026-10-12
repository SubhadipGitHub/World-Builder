import type { LampPlacement } from '../layout/lamps';
import type { Bounds2D, Pose } from '../layout/positions';
import { sitePlan, type Gantry } from '../layout/site';
import type { Vec2 } from '../sim/types';

// Pacific Gateway International Airport layout (requirements §11.2, architecture §19 H1). Pure.

export type GateId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8';
export const GATE_IDS: readonly GateId[] = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'];

export type AirportBuildingId = 'tower' | 'fire' | 'fuel' | 'cargo' | 'garage' | 'hotel' | 'cellLot';

export interface Box {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface Gate {
  readonly id: GateId;
  /** Parked jet: centre and nose heading (nose in, towards the terminal). */
  readonly stand: Pose;
  /** Where the jet bridge leaves the terminal facade. */
  readonly bridgeRoot: Vec2;
}

export interface AirfieldLight {
  readonly x: number;
  readonly z: number;
  readonly colour: 'white' | 'green' | 'red' | 'blue';
}

/** A name-label anchor (L-1); ids match ui/places. */
export interface PlaceAnchor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AirportPlan {
  /** Everything the airport occupies, for the camera limits (L-2). */
  readonly bounds: Bounds2D;
  readonly airsideFence: { readonly z: number; readonly fromX: number; readonly toX: number; readonly gate: Pose };
  readonly terminal: Box;
  readonly curb: { readonly z: number; readonly fromX: number; readonly toX: number };
  readonly apron: Bounds2D;
  readonly gates: readonly Gate[];
  readonly runway: { readonly z: number; readonly fromX: number; readonly toX: number; readonly width: number };
  readonly taxiway: { readonly z: number; readonly fromX: number; readonly toX: number; readonly width: number };
  /** Arrivals' taxi lane along the apron (westbound). */
  readonly apronLane: { readonly z: number; readonly fromX: number; readonly toX: number };
  /** Rapid exit from the runway to the apron lane (arrivals). */
  readonly rapidExit: readonly Vec2[];
  readonly buildings: readonly (Box & { readonly id: AirportBuildingId })[];
  readonly boulevard: { readonly x: number; readonly fromZ: number; readonly toZ: number; readonly deckY: number; readonly width: number };
  /** Where the boulevard crosses the hub's road extensions (M5). */
  readonly overpasses: readonly { readonly z: number; readonly clearance: number }[];
  /** Parking for an extra arrival when every gate is full (H5). */
  readonly remoteStand: Pose;
  /** Apron floodlight masts (H8). */
  readonly masts: readonly LampPlacement[];
  readonly airfieldLights: readonly AirfieldLight[];
  readonly gantries: readonly Gantry[];
  readonly labels: readonly PlaceAnchor[];
}

/** West/east/south/north limits of the grass (landscape plane). */
export const GROUND: Bounds2D = { minX: -660, maxX: 640, minZ: -470, maxZ: 530 };
export const RUNWAY_LENGTH = 1200;
export const RUNWAY_WIDTH = 45;

const FENCE_Z = 235;
const TERMINAL: Box = { id: 'terminal', x: 0, z: 285, width: 300, depth: 40, height: 18 };
const CURB = { z: 250, fromX: -160, toX: 160 } as const;
const APRON: Bounds2D = { minX: -210, maxX: 220, minZ: 312, maxZ: 410 };
const STAND_Z = 345;
/** Gate stands every 46 m (wingspan 36 m + 10 m), centred on the terminal. */
const STAND_STEP = 46;
const NOSE_IN = -Math.PI / 2;
const RUNWAY = { z: 482, fromX: -600, toX: 600, width: RUNWAY_WIDTH } as const;
const TAXIWAY = { z: 430, fromX: -560, toX: 560, width: 23 } as const;
const APRON_LANE = { z: 395, fromX: -400, toX: 220 } as const;
const BOULEVARD = { x: -420, fromZ: -470, toZ: CURB.z, deckY: 8, width: 24 } as const;
/** The boulevard deck is level up to here, then ramps down to the curb. */
export const DECK_END_Z = 200;

let cached: AirportPlan | null = null;

/** The airport plan, computed once and cached. */
export function airportPlan(): AirportPlan {
  if (cached) return cached;
  const gates: Gate[] = GATE_IDS.map((id, i) => {
    const x = (i - (GATE_IDS.length - 1) / 2) * STAND_STEP;
    return { id, stand: { x, z: STAND_Z, heading: NOSE_IN }, bridgeRoot: { x, z: TERMINAL.z + TERMINAL.depth / 2 } };
  });
  const buildings: (Box & { readonly id: AirportBuildingId })[] = [
    { id: 'tower', x: 260, z: 330, width: 14, depth: 14, height: 60 },
    { id: 'fire', x: 340, z: 380, width: 40, depth: 26, height: 9 },
    { id: 'fuel', x: 450, z: 300, width: 60, depth: 40, height: 12 },
    { id: 'cargo', x: -430, z: 300, width: 70, depth: 40, height: 14 },
    { id: 'garage', x: -330, z: 60, width: 70, depth: 90, height: 15 },
    { id: 'hotel', x: -340, z: -260, width: 30, depth: 30, height: 40 },
    { id: 'cellLot', x: -60, z: -250, width: 70, depth: 30, height: 0.5 },
  ];

  const airfieldLights: AirfieldLight[] = [];
  for (let x = RUNWAY.fromX; x <= RUNWAY.toX + 1e-6; x += 60) {
    for (const side of [1, -1]) airfieldLights.push({ x, z: RUNWAY.z + (side * RUNWAY.width) / 2, colour: 'white' });
  }
  // Threshold (landing end, east) green; runway end (west) red.
  for (let k = -4; k <= 4; k++) {
    const z = RUNWAY.z + (k / 4) * (RUNWAY.width / 2 - 1);
    airfieldLights.push({ x: RUNWAY.toX + 3, z, colour: 'green' }, { x: RUNWAY.fromX - 3, z, colour: 'red' });
  }
  for (let x = TAXIWAY.fromX; x <= TAXIWAY.toX + 1e-6; x += 40) {
    for (const side of [1, -1]) airfieldLights.push({ x, z: TAXIWAY.z + (side * TAXIWAY.width) / 2, colour: 'blue' });
  }

  // Apron floodlight masts between the gate stands, just off the terminal facade.
  const masts: LampPlacement[] = [-200, -138, -46, 46, 138, 200].map((x) => ({ x, z: APRON.minZ + 2, heading: Math.PI / 2, kind: 'mast' }));

  const gantry = (z: number, text: string): Gantry => ({ x: BOULEVARD.x, z, heading: Math.PI / 2, span: BOULEVARD.width + 4, clearance: 6.5, text });

  cached = {
    bounds: { minX: -650, maxX: 630, minZ: BOULEVARD.fromZ, maxZ: RUNWAY.z + RUNWAY.width / 2 },
    airsideFence: { z: FENCE_Z, fromX: -650, toX: 630, gate: { x: -300, z: FENCE_Z, heading: Math.PI / 2 } },
    terminal: TERMINAL,
    curb: CURB,
    apron: APRON,
    gates,
    runway: RUNWAY,
    taxiway: TAXIWAY,
    apronLane: APRON_LANE,
    // West-end exit: arrivals leave the runway west of every gate, so they never meet departures (H3).
    rapidExit: [
      { x: -200, z: RUNWAY.z },
      { x: -215, z: 456 },
      { x: -225, z: TAXIWAY.z },
      { x: -220, z: APRON_LANE.z },
    ],
    buildings,
    boulevard: BOULEVARD,
    overpasses: sitePlan().roadExtensions.map((e) => ({ z: e.z, clearance: BOULEVARD.deckY - 1 })),
    remoteStand: { x: -330, z: STAND_Z, heading: NOSE_IN },
    masts,
    airfieldLights,
    gantries: [gantry(-300, 'Parking · Hotel · Cell Phone Lot'), gantry(-110, 'Rental Car Return → GoldLane'), gantry(120, 'Terminal A · Departures / Arrivals')],
    labels: [
      { id: 'terminalA', x: TERMINAL.x, y: 30, z: TERMINAL.z },
      { id: 'tower', x: 260, y: 70, z: 330 },
      { id: 'runway', x: 0, y: 10, z: RUNWAY.z },
      { id: 'garage', x: -330, y: 22, z: 60 },
      { id: 'hotel', x: -340, y: 48, z: -260 },
      { id: 'cellLot', x: -60, y: 6, z: -250 },
      { id: 'cargo', x: -430, y: 22, z: 300 },
      { id: 'fire', x: 340, y: 14, z: 380 },
      { id: 'fuelFarm', x: 450, y: 18, z: 300 },
    ],
  };
  return cached;
}
