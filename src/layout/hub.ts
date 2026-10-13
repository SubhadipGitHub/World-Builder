import { dimensions, facility, maxFleetLength } from '../config/facility';
import type { LotRow } from '../config/fleet';
import { buildLaneGraph, type EdgeSpec, type LaneGraph, type LaneGraphSpec, type NodeSpec } from '../sim/graph/laneGraph';
import type { AgentKind, Vec2 } from '../sim/types';

/**
 * The GoldLane hub: one facility definition shared by the simulation (lane graph,
 * resources) and the renderer (buildings, areas). Metres; x east, z south.
 *
 * Flow (acyclic, architecture §4.1): entry → return canopy → [tow bay] → wash → [service]
 * → EV chargers | fuel pumps → Ready lot → exit gates → off-map.
 */

export type StationId = 'returnLane' | 'towBay' | 'wash' | 'service' | 'charger' | 'pump' | 'slot' | 'gate';

export interface UnitLayout {
  readonly id: string;
  /** Edge whose end is the parking spot. */
  readonly parkEdge: string;
  /** Ready-lot class row. */
  /** Ready-lot row of a slot (M9, FE-3). */
  readonly tag?: LotRow;
  /** Service bays only: the edge just past the bay where a tow truck stops to set a car down. */
  readonly beyondEdge?: string;
}

export interface StationLayout {
  readonly id: StationId;
  /** Edge whose end is the queue head; null when cars request the unit in place. */
  readonly queueEdge: string | null;
  readonly units: readonly UnitLayout[];
}

export interface BuildingLayout {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export type AreaId = 'overview' | 'return' | 'wash' | 'energy' | 'lot' | 'airport';

export interface AreaLayout {
  readonly id: AreaId;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  /** Camera distance that frames the area. */
  readonly distance: number;
  /**
   * Camera azimuth (radians, 0 = looking north from the south). Areas are laid out east–west,
   * so a south view runs them across the uncovered middle of the screen. Omitted = keep current.
   */
  readonly azimuth?: number;
}

export interface HubLayout {
  readonly graph: LaneGraphSpec;
  readonly entryEdge: string;
  readonly exitEdge: string;
  readonly stations: Readonly<Record<StationId, StationLayout>>;
  readonly tow: {
    readonly depotEdge: string;
    /** Where the tow truck stops in front of a car waiting in the tow bay. */
    readonly stopEdge: string;
    /** Gap between the tow truck's rear and the carried car's front. */
    readonly gap: number;
    /** Body length the tow truck occupies while carrying the longest car. */
    readonly carryLength: number;
  };
  readonly shuttle: { readonly loop: readonly string[]; readonly stopEdge: string };
  readonly serviceLoop: readonly string[];
  readonly walkway: { readonly doorEdge: string; readonly routes: Readonly<Record<LotRow, readonly string[]>> };
  readonly buildings: readonly BuildingLayout[];
  readonly areas: readonly AreaLayout[];
}

// ---------- builder helpers ----------

const EAST = 0;
const SOUTH = Math.PI / 2;
const WEST = Math.PI;
const NORTH = -Math.PI / 2;

const SPEED = { entry: 10, road: 9, lane: 5, bay: 4.5, stall: 3, lot: 4.5, service: 7, walk: 2, shuttle: 10 } as const;
const SERVICE_KINDS: readonly AgentKind[] = ['cart', 'tow', 'van'];

interface Point extends Vec2 {
  readonly id: string;
}

const nodes: NodeSpec[] = [];
const edges: EdgeSpec[] = [];

function node(id: string, x: number, z: number): Point {
  nodes.push({ id, x, z });
  return { id, x, z };
}

interface EdgeOptions {
  readonly speed: number;
  readonly via?: readonly Vec2[];
  readonly kinds?: readonly AgentKind[];
  readonly width?: number;
  readonly group?: string;
}

function edge(id: string, from: Point, to: Point, o: EdgeOptions): string {
  edges.push({
    id,
    from: from.id,
    to: to.id,
    speedLimit: o.speed,
    ...(o.via ? { via: o.via } : {}),
    ...(o.kinds ? { kinds: o.kinds } : {}),
    ...(o.width !== undefined ? { width: o.width } : {}),
    ...(o.group ? { group: o.group } : {}),
  });
  return id;
}

/** Interior points of a cubic Bézier from a (heading ha) to b (heading hb), about every 1.5 m. */
function curve(a: Vec2, ha: number, b: Vec2, hb: number, reach = 0.4): Vec2[] {
  const d = Math.hypot(b.x - a.x, b.z - a.z) * reach;
  const p1 = { x: a.x + Math.cos(ha) * d, z: a.z + Math.sin(ha) * d };
  const p2 = { x: b.x - Math.cos(hb) * d, z: b.z - Math.sin(hb) * d };
  const n = Math.max(2, Math.ceil((Math.hypot(b.x - a.x, b.z - a.z) * 1.2) / 1.5));
  const out: Vec2[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
      z: u * u * u * a.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * b.z,
    });
  }
  return out;
}

const pt = (x: number, z: number): Vec2 => ({ x, z });

// ---------- return canopy ----------

const IN0 = node('in0', -220, -70);
const RQ = node('rq', -140, -70);
const entryEdge = edge('entry', IN0, RQ, { speed: SPEED.entry });

const M_RET = node('m_ret', -65, -70);
const LANE_Z = [-79, -73, -67, -61];
const returnUnits: UnitLayout[] = LANE_Z.map((z, i) => {
  const k = node(`k${String(i)}`, -100, z);
  const park = edge(`ret${String(i)}`, RQ, k, { speed: SPEED.lane, via: [...curve(RQ, EAST, pt(-118, z), EAST), pt(-118, z)] });
  edge(`retx${String(i)}`, k, M_RET, { speed: SPEED.lane, via: [pt(-85, z), ...curve(pt(-85, z), EAST, M_RET, EAST)] });
  return { id: `lane${String(i + 1)}`, parkEdge: park };
});

// ---------- tow bay (spur north of the road) ----------

const TOW_GAP = 1.0;
const TOW_CARRY = dimensions.tow.length + TOW_GAP + maxFleetLength;

const TP = node('tp', -45, -70);
edge('r1', M_RET, TP, { speed: SPEED.road });
const TQ = node('tq', -29, -80);
const towBayPark = edge('tow_spur', TP, TQ, { speed: SPEED.bay, via: curve(TP, EAST, TQ, EAST), group: 'towbay' });

// ---------- service loop (carts, tow truck, van) ----------

const SW0 = node('sw0', -160, -98);
const U = node('u', -47, -98);
const V = node('v', 3, -98);
const TC = node('tc', 47, -98);
const SE0 = node('se0', 175, -98);
const SE1 = node('se1', 175, -110);
const DTJ = node('dtj', 160, -110);
const DW = node('dw', -115, -110);
const DX = node('dx', -145, -110);
const SW1 = node('sw1', -160, -110);
const svc = { speed: SPEED.service, kinds: SERVICE_KINDS, width: 3.0 };
const serviceLoop = [
  edge('sv_e0', SW0, U, svc),
  edge('sv_e1', U, V, svc),
  edge('sv_e2', V, TC, svc),
  edge('sv_e3', TC, SE0, svc),
  edge('sv_eu', SE0, SE1, { ...svc, via: [...curve(SE0, EAST, pt(181, -104), SOUTH), pt(181, -104), ...curve(pt(181, -104), SOUTH, SE1, WEST)] }),
  edge('sv_w0', SE1, DTJ, svc),
  edge('sv_w1', DTJ, DW, svc),
  edge('sv_w2', DW, DX, svc),
  edge('sv_w3', DX, SW1, svc),
  edge('sv_wu', SW1, SW0, { ...svc, via: [...curve(SW1, WEST, pt(-166, -104), NORTH), pt(-166, -104), ...curve(pt(-166, -104), NORTH, SW0, EAST)] }),
];

const TD = node('td', -130, -120);
const depotEdge = edge('depot_in', DW, TD, { speed: SPEED.bay, kinds: ['tow'], via: curve(DW, WEST, TD, WEST) });
edge('depot_out', TD, DX, { speed: SPEED.bay, kinds: ['tow'], via: curve(TD, WEST, DX, WEST) });

// Tow truck stops in front of the car waiting at TQ, then rejoins the service loop.
const W = node('w', TQ.x + dimensions.tow.length + TOW_GAP, TQ.z);
const towStop = edge('tow_stop', U, W, { speed: SPEED.bay, kinds: ['tow'], via: curve(U, EAST, W, EAST, 0.5), group: 'towbay' });
edge('tow_out', W, V, { speed: SPEED.bay, kinds: ['tow'], via: curve(W, EAST, V, EAST), group: 'towbay' });

// ---------- wash ----------

const WQ = node('wq', 0, -70);
const washQueue = edge('wash_q', TP, WQ, { speed: SPEED.road });
const M_WASH = node('m_wash', 40, -70);
const washUnits: UnitLayout[] = [-73, -67].map((z, j) => {
  const wb = node(`wb${String(j)}`, 16, z);
  const park = edge(`wash${String(j)}`, WQ, wb, { speed: SPEED.bay, via: [...curve(WQ, EAST, pt(10, z), EAST), pt(10, z)] });
  edge(`washx${String(j)}`, wb, M_WASH, { speed: SPEED.bay, via: curve(wb, EAST, M_WASH, EAST) });
  return { id: `wash${String(j + 1)}`, parkEdge: park };
});
const D_SVC = node('d_svc', 60, -70);
edge('r2', M_WASH, D_SVC, { speed: SPEED.road });

// ---------- service bays ----------

const QM = node('qm', 73, -70);
const SQ = node('sq', 93, -70);
edge('svc_in', D_SVC, QM, { speed: SPEED.road });
const serviceQueue = edge('svc_q', QM, SQ, { speed: SPEED.lane });
edge('tow_conn', TC, QM, { speed: SPEED.bay, kinds: ['tow'], via: curve(TC, EAST, QM, EAST) });
const M_SVC = node('m_svc', 143, -70);
const serviceUnits: UnitLayout[] = [-82, -76, -70].map((z, k) => {
  const sb = node(`sb${String(k)}`, 120, z);
  const wk = node(`wk${String(k)}`, 120 + dimensions.tow.length + TOW_GAP, z);
  const park = edge(`svc${String(k)}`, SQ, sb, { speed: SPEED.bay, via: [...curve(SQ, EAST, pt(105, z), EAST), pt(105, z)] });
  const beyond = edge(`svcb${String(k)}`, sb, wk, { speed: SPEED.bay });
  edge(`svcx${String(k)}`, wk, M_SVC, { speed: SPEED.bay, via: curve(wk, EAST, M_SVC, EAST) });
  return { id: `bay${String(k + 1)}`, parkEdge: park, beyondEdge: beyond };
});
const DT = node('dt', 151, -70);
edge('svc_out', M_SVC, DT, { speed: SPEED.road });

// ---------- energy road ----------

const E1 = node('e1', 85, -50);
const E2 = node('e2', 170, -30);
const ED = node('ed', 170, -10);
edge('energy1', D_SVC, E1, { speed: SPEED.road, via: curve(D_SVC, EAST, E1, EAST) });
edge('energy2', E1, E2, { speed: SPEED.road, via: [pt(150, -50), ...curve(pt(150, -50), EAST, E2, SOUTH)] });
edge('svc_energy', DT, E2, { speed: SPEED.road, via: [...curve(DT, EAST, pt(170, -51), SOUTH), pt(170, -51)] });
edge('energy3', E2, ED, { speed: SPEED.road });
edge('tow_ret', DT, DTJ, {
  speed: SPEED.bay,
  kinds: ['tow'],
  via: [...curve(DT, EAST, pt(165, -84), NORTH), pt(165, -84), pt(165, -103), ...curve(pt(165, -103), NORTH, DTJ, WEST)],
});

// ---------- EV chargers and fuel pumps ----------

const EVQ = node('evq', 125, 18);
const chargerQueue = edge('ev_q', ED, EVQ, {
  speed: SPEED.lane,
  via: [...curve(ED, SOUTH, pt(155, 5), WEST), pt(155, 5), pt(138, 5), ...curve(pt(138, 5), WEST, EVQ, SOUTH)],
});
const FQ = node('fq', 170, 18);
const pumpQueue = edge('fuel_q', ED, FQ, { speed: SPEED.lane });

const M_EV = node('m_ev', 125, 72);
const chargerUnits: UnitLayout[] = Array.from({ length: facility.evChargers }, (_, k) => {
  const x = 111 + 4 * k;
  const c = node(`c${String(k)}`, x, 50);
  const park = edge(`chg${String(k)}`, EVQ, c, { speed: SPEED.bay, width: 2.6, via: [...curve(EVQ, SOUTH, pt(x, 34), SOUTH), pt(x, 34)] });
  edge(`chgx${String(k)}`, c, M_EV, { speed: SPEED.bay, width: 2.6, via: [pt(x, 56), ...curve(pt(x, 56), SOUTH, M_EV, SOUTH)] });
  return { id: `charger${String(k + 1)}`, parkEdge: park };
});

const M_FUEL = node('m_fuel', 170, 72);
const pumpUnits: UnitLayout[] = Array.from({ length: facility.fuelPumps }, (_, k) => {
  const x = 161 + 6 * k;
  const p = node(`p${String(k)}`, x, 50);
  const park = edge(`pump${String(k)}`, FQ, p, { speed: SPEED.bay, width: 3.0, via: [...curve(FQ, SOUTH, pt(x, 34), SOUTH), pt(x, 34)] });
  edge(`pumpx${String(k)}`, p, M_FUEL, { speed: SPEED.bay, width: 3.0, via: [pt(x, 56), ...curve(pt(x, 56), SOUTH, M_FUEL, SOUTH)] });
  return { id: `pump${String(k + 1)}`, parkEdge: park };
});

// Energy bypass (M7, R-8): east of the fuel station, so charge-later cars reach the lot without
// entering a charger or pump lane.
edge('energy_bypass', ED, M_FUEL, {
  speed: SPEED.lane,
  via: [...curve(ED, SOUTH, pt(189, 8), SOUTH), pt(189, 60), ...curve(pt(189, 60), SOUTH, M_FUEL, WEST)],
});

const ME = node('me', 110, 85);
edge('ev_out', M_EV, ME, { speed: SPEED.lane, via: curve(M_EV, SOUTH, ME, WEST) });
edge('fuel_out', M_FUEL, ME, { speed: SPEED.lane, via: [...curve(M_FUEL, SOUTH, pt(157, 85), WEST), pt(157, 85)] });

// ---------- Ready lot: drive-through stalls between paired southbound aisles ----------

const LE = node('le', 80, 85);
const lotQueue = edge('lot_q', ME, LE, { speed: SPEED.lot });

interface Row {
  /** Lot row (M9, FE-3, D51): Cars, SUVs & vans, EV; the geometry is unchanged from M1. */
  readonly row: LotRow;
  readonly xIn: number;
  readonly stalls: number;
}
const ROWS: readonly Row[] = [
  { row: 'cars', xIn: 60, stalls: facility.readySlots.cars },
  { row: 'large', xIn: 38, stalls: facility.readySlots.large },
  { row: 'ev', xIn: 16, stalls: facility.readySlots.ev },
];
const STALL_PITCH = 3.2;
const STALL_Z0 = 99;
const stallZ = (k: number): number => STALL_Z0 + STALL_PITCH * k;
/** Walkway crosses the exit aisles south of the last stalls, clear of every stall merge (box rule). */
const WALK_Z = 168;
const GATE_Z = 190;

const J0 = node('j0', 74, 85);
const J1 = node('j1', 52, 85);
const J2 = node('j2', 30, 85);
edge('lot_j0', LE, J0, { speed: SPEED.lot });
edge('lot_j1', J0, J1, { speed: SPEED.lot });
edge('lot_j2', J1, J2, { speed: SPEED.lot });
const rowEntry = [J0, J1, J2];

const GR = [node('gr0', 35, GATE_Z), node('gr1', 13, GATE_Z), node('gr2', -9, GATE_Z)];
const slotUnits: UnitLayout[] = [];
ROWS.forEach((row, r) => {
  const xOut = row.xIn - 13;
  const a = Array.from({ length: row.stalls }, (_, k) => node(`a${String(r)}_${String(k)}`, row.xIn, stallZ(k)));
  const b = Array.from({ length: row.stalls }, (_, k) => node(`b${String(r)}_${String(k)}`, xOut, stallZ(k)));
  const first = a[0] as Point;
  edge(`row${String(r)}_in`, rowEntry[r] as Point, first, { speed: SPEED.lot, via: curve(rowEntry[r] as Point, WEST, first, SOUTH) });
  for (let k = 0; k < row.stalls; k++) {
    const ak = a[k] as Point;
    const bk = b[k] as Point;
    const pk = node(`pk${String(r)}_${String(k)}`, row.xIn - 9, stallZ(k));
    const park = edge(`slot${String(r)}_${String(k)}`, ak, pk, { speed: SPEED.stall, width: 2.4 });
    edge(`slotx${String(r)}_${String(k)}`, pk, bk, { speed: SPEED.stall, width: 2.4 });
    slotUnits.push({ id: `${row.row}-${String(k + 1).padStart(2, '0')}`, parkEdge: park, tag: row.row });
    if (k + 1 < row.stalls) {
      edge(`a${String(r)}_${String(k)}`, ak, a[k + 1] as Point, { speed: SPEED.lot });
      edge(`b${String(r)}_${String(k)}`, bk, b[k + 1] as Point, { speed: SPEED.lot });
    }
  }
  const last = b[row.stalls - 1] as Point;
  const gr = GR[r] as Point;
  const turnFrom = pt(xOut, gr.z - 12);
  const straight = last.z < turnFrom.z - 0.5 ? [turnFrom] : [];
  edge(`row${String(r)}_out`, last, gr, { speed: SPEED.lot, via: [...straight, ...curve(straight.length ? turnFrom : last, SOUTH, gr, WEST)] });
});

// ---------- exit gates ----------

const GF = node('gf', -40, GATE_Z);
edge('gate_r0', GR[0] as Point, GR[1] as Point, { speed: SPEED.lot });
edge('gate_r1', GR[1] as Point, GR[2] as Point, { speed: SPEED.lot });
const gateQueue = edge('gate_q', GR[2] as Point, GF, { speed: SPEED.lot });
const GX = node('gx', -85, GATE_Z);
/** Gate lanes are 6 m apart, centred on GATE_Z (one per facility.exitGates). */
const GATE_PITCH = 6;
const gateZs = Array.from({ length: facility.exitGates }, (_, k) => GATE_Z + (k - (facility.exitGates - 1) / 2) * GATE_PITCH);
const gateUnits: UnitLayout[] = gateZs.map((z, k) => {
  const g = node(`g${String(k)}`, -65, z);
  const park = edge(`gate${String(k)}`, GF, g, { speed: SPEED.bay, via: [...curve(GF, WEST, pt(-52, z), WEST), pt(-52, z)] });
  edge(`gatex${String(k)}`, g, GX, { speed: SPEED.bay, via: curve(g, WEST, GX, WEST) });
  return { id: `gate${String(k + 1)}`, parkEdge: park };
});
const OUT = node('out', -220, GATE_Z);
const exitEdge = edge('exit', GX, OUT, { speed: SPEED.entry });

// ---------- pedestrian walkway: terminal door → medians between lot rows ----------

const walk = { speed: SPEED.walk, kinds: ['pedestrian'] as const, width: 2.0 };
const DOOR = node('door', -38, 140);
const MW2 = node('mw2', -6, WALK_Z);
const MW1 = node('mw1', 14, WALK_Z);
const MW0 = node('mw0', 36, WALK_Z);
const doorEdge = edge('walk0', DOOR, MW2, { ...walk, via: [pt(-26, 140), ...curve(pt(-26, 140), EAST, pt(-16, WALK_Z), EAST), pt(-16, WALK_Z)] });
const walk1 = edge('walk1', MW2, MW1, walk);
const walk2 = edge('walk2', MW1, MW0, walk);

// ---------- shuttle loop (terminal kerb ↔ off-map airport) ----------

const SH0 = node('sh0', -220, 100);
const SH1 = node('sh1', -110, 100);
const KS = node('ks', -97, 132);
const SH3 = node('sh3', -220, 150);
const shuttle = { speed: SPEED.shuttle, kinds: ['shuttle'] as const, width: 3.0 };
const shuttleLoop = [
  edge('sh_a', SH0, SH1, shuttle),
  edge('sh_b', SH1, KS, { ...shuttle, via: [...curve(SH1, EAST, pt(-97, 113), SOUTH), pt(-97, 113)] }),
  edge('sh_c', KS, SH3, { ...shuttle, via: [pt(-97, 138), ...curve(pt(-97, 138), SOUTH, pt(-110, 150), WEST), pt(-110, 150)] }),
  edge('sh_d', SH3, SH0, {
    ...shuttle,
    via: [...curve(SH3, WEST, pt(-235, 125), NORTH), pt(-235, 125), ...curve(pt(-235, 125), NORTH, SH0, EAST)],
  }),
];

// ---------- export ----------

export const hub: HubLayout = {
  graph: { nodes, edges },
  entryEdge,
  exitEdge,
  stations: {
    returnLane: { id: 'returnLane', queueEdge: entryEdge, units: returnUnits },
    towBay: { id: 'towBay', queueEdge: null, units: [{ id: 'towbay1', parkEdge: towBayPark }] },
    wash: { id: 'wash', queueEdge: washQueue, units: washUnits },
    service: { id: 'service', queueEdge: serviceQueue, units: serviceUnits },
    charger: { id: 'charger', queueEdge: chargerQueue, units: chargerUnits },
    pump: { id: 'pump', queueEdge: pumpQueue, units: pumpUnits },
    slot: { id: 'slot', queueEdge: lotQueue, units: slotUnits },
    gate: { id: 'gate', queueEdge: gateQueue, units: gateUnits },
  },
  tow: { depotEdge, stopEdge: towStop, gap: TOW_GAP, carryLength: TOW_CARRY },
  shuttle: { loop: shuttleLoop, stopEdge: 'sh_b' },
  serviceLoop,
  walkway: {
    doorEdge,
    routes: { ev: [doorEdge], large: [doorEdge, walk1], cars: [doorEdge, walk1, walk2] },
  },
  buildings: [
    { id: 'terminal', label: 'Terminal & GoldLane Express counter', x: -65, z: 122, width: 50, depth: 55, height: 12 },
    { id: 'canopy', label: 'Return canopy & inspection lanes', x: -100, z: -70, width: 30, depth: 28, height: 7 },
    { id: 'wash', label: 'Express wash', x: 10, z: -70, width: 20, depth: 16, height: 6 },
    { id: 'service', label: 'Maintenance & service bays', x: 113, z: -76, width: 26, depth: 22, height: 8 },
    { id: 'evHub', label: 'EV fast-charging hub', x: 125, z: 42, width: 38, depth: 14, height: 5 },
    { id: 'fuel', label: 'Fuel station', x: 170, z: 42, width: 28, depth: 14, height: 5 },
    { id: 'lot', label: 'Ready-for-Rent lot', x: 30, z: 126, width: 72, depth: 62, height: 0.2 },
    { id: 'gates', label: 'Exit gates', x: -65, z: GATE_Z, width: 8, depth: facility.exitGates * GATE_PITCH + 4, height: 4 },
    { id: 'depot', label: 'Tow depot', x: -130, z: -121, width: 12, depth: 8, height: 5 },
  ],
  areas: [
    { id: 'overview', label: 'Overview', x: 0, z: 35, distance: 560 },
    { id: 'return', label: 'Return & inspection', x: -100, z: -72, distance: 130, azimuth: 0 },
    { id: 'wash', label: 'Wash & maintenance', x: 68, z: -74, distance: 170, azimuth: 0 },
    { id: 'energy', label: 'EV charging & fuel', x: 145, z: 38, distance: 150, azimuth: 0 },
    { id: 'lot', label: 'Ready lot & exit gate', x: -5, z: 150, distance: 250, azimuth: 0 },
    // M6 (L-2): the terminal and apron, from the south.
    { id: 'airport', label: 'Airport', x: 0, z: 380, distance: 700, azimuth: 0 },
  ],
};

let cached: LaneGraph | null = null;

/** The hub's lane graph, built once (zone detection is the expensive part). */
export function hubGraph(): LaneGraph {
  cached ??= buildLaneGraph(hub.graph);
  return cached;
}
