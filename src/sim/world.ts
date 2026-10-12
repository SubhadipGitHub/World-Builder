import { brand, type Tier } from '../config/brand';
import { dimensions, energy, facility } from '../config/facility';
import { idm, priority, rates as defaultRates } from '../config/rates';
import { weather as weatherTable, type WeatherMode } from '../config/weather';
import { hub, hubGraph, type StationId, type UnitLayout } from '../layout/hub';
import { createDataGen } from './datagen';
import { createRentPool, pickupArrivals, rentalDuration } from './demand';
import { chargeSoc, refuel, secondsToSoc } from './energy';
import type { SimEvent } from './events';
import type { Footprint } from './invariants';
import { isParkedState, milestoneFor, TRACKER_STAGES, type TrackerStage, type VehicleState } from './lifecycle';
import { averageReadyEvSoc, averageTurnaroundMin, utilisation, type TurnaroundRecord } from './metrics';
import { createResourcePool, type ResourcePool } from './resources';
import { createRng } from './rng';
import { createTrafficEngine, type MoverSpec, type MoverView } from './traffic/engine';
import type { AgentKind, Vec2, VehicleClass } from './types';

export interface RateOverrides {
  readonly maintenanceChance?: number;
  readonly severeChance?: number;
  readonly meanRentalSimSec?: number;
  readonly pickupsPerSimHour?: number;
}

export interface SimConfig {
  readonly seed: number | string;
  readonly weather?: WeatherMode;
  /** Process-clock multiplier (L-6). Default config rates.timeScale. */
  readonly timeScale?: number;
  /** Test and tuning hook: overrides a few lifecycle rates. */
  readonly rateOverrides?: RateOverrides;
}

/** Plain, structured-clone-safe view of one agent (architecture §5). */
export interface AgentView {
  readonly id: string;
  readonly kind: AgentKind;
  readonly cls: VehicleClass | null;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
  readonly length: number;
  readonly width: number;
  /** Stationary by design (at a resource, parked, waiting), so not gridlock. */
  readonly parked: boolean;
  readonly state: VehicleState | null;
  readonly stage: TrackerStage | null;
  readonly plate: string | null;
  /** Rental agreement while a customer is departing with the car (D-2 search); otherwise null. */
  readonly agreementNo: string | null;
  readonly fuelPct: number | null;
  readonly socPct: number | null;
  readonly odometerMi: number | null;
  readonly task: string;
  readonly etaSimSec: number | null;
  readonly parentId: string | null;
}

export type ResourceKind = 'returnLane' | 'wash' | 'service' | 'charger' | 'pump' | 'slot' | 'gate';

export interface ResourceView {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly occupantId: string | null;
  readonly queueLength: number;
  /** Cycle progress in [0, 1] while working; null when idle. */
  readonly progress: number | null;
}

export interface Snapshot {
  readonly tick: number;
  readonly simTimeSec: number;
  /** Hub local time of day in hours, [0, 24). */
  readonly clockHours: number;
  readonly weather: WeatherMode;
  readonly timeScale: number;
  readonly agents: readonly AgentView[];
  readonly resources: readonly ResourceView[];
}

export interface Metrics {
  readonly turnaroundMin: number | null;
  readonly utilisation: number;
  readonly readyEvSocPct: number | null;
  readonly counts: {
    readonly total: number;
    readonly onRent: number;
    readonly ready: number;
    readonly inTurnaround: number;
  };
  /** Vehicles currently at each tracker stage (D-5, nothing selected). */
  readonly stageCounts: Readonly<Record<TrackerStage, number>>;
}

export type Command =
  | { readonly type: 'setWeather'; readonly mode: WeatherMode }
  | { readonly type: 'setTimeScale'; readonly value: number };

export interface Sim {
  /** Advances one fixed step (rates.stepWallSec of wall time). */
  step(): void;
  snapshot(): Snapshot;
  metrics(): Metrics;
  apply(command: Command): void;
  /** Events since the previous drain, in emission order. */
  drainEvents(): readonly SimEvent[];
  /** Current footprints of every on-map agent, for the invariant checks. */
  footprints(): readonly Footprint[];
}

// ---------- internal model ----------

/** Wall-clock steps run before t = 0 so the hub starts mid-operation (3-second "alive" story). */
const PREROLL_STEPS = 1_800;
const START_HOUR = 8;
const AGREEMENT_YEAR = 2026;
const TURNAROUND_WINDOW_SEC = 2 * 3600;
const QUEUE_OVERFLOW = 6;
const SLOT_FALLBACK_SEC = 120;
const INITIAL_STAGED: Readonly<Record<VehicleClass, number>> = { sedan: 8, suv: 6, ev: 8 };
const GATE_DWELL = { min: 10, max: 20 } as const;
const SHUTTLE_DWELL = { min: 120, max: 240 } as const;
/** Distance over which a towed car slides from its parked pose onto the tow truck's track. */
const TOW_BLEND_M = 10;

type Station = Exclude<StationId, never>;

type Phase =
  | { readonly kind: 'offMap' }
  | { readonly kind: 'toQueue'; readonly station: Station }
  | { readonly kind: 'awaitGrant'; readonly station: Station; readonly since: number; readonly tagged: boolean }
  | { readonly kind: 'toUnit'; readonly station: Station; readonly unitId: string }
  | {
      readonly kind: 'working';
      readonly station: Station;
      readonly unitId: string;
      readonly start: number;
      readonly until: number;
      /** Severe cars are detailed in the service bay after the repair. */
      readonly detailing?: boolean;
    }
  | { readonly kind: 'staged'; readonly unitId: string }
  | { readonly kind: 'towWait'; readonly unitId: string }
  | { readonly kind: 'towed'; readonly towId: string }
  | { readonly kind: 'exiting' };

interface Vehicle {
  readonly id: string;
  readonly cls: VehicleClass;
  readonly plate: string;
  state: VehicleState;
  phase: Phase;
  stage: TrackerStage | null;
  odometerMi: number;
  fuelPct: number | null;
  socPct: number | null;
  energyStart: number;
  energyTarget: number;
  maintenance: boolean;
  severe: boolean;
  serviced: boolean;
  washed: boolean;
  returnedAt: number | null;
  customerId: string | null;
  agreementNo: string | null;
  tier: Tier | null;
  /** Pose while parked at the tow bay, used to blend onto the tow truck. */
  parkedPose: { x: number; z: number; heading: number } | null;
}

interface PendingRelease {
  readonly vehicleId: string;
  readonly station: Station;
  readonly unitId: string;
  readonly edge: string;
}

type TowPhase = 'depot' | 'toPickup' | 'toQueue' | 'awaitBay' | 'toBay' | 'returning';

interface Tow {
  readonly id: string;
  phase: TowPhase;
  carId: string | null;
  unitId: string | null;
  travelledSinceAttach: number;
}

interface Shuttle {
  readonly id: string;
  dwellUntil: number | null;
}

interface Patrol {
  readonly id: string;
  lastEdge: string;
}

interface Customer {
  readonly cls: VehicleClass;
  readonly tier: Tier;
}

const QUEUE_STATES: ReadonlySet<VehicleState> = new Set(['washQueue', 'serviceQueue', 'energyQueue', 'toLot', 'departing', 'arriving']);

const shortest = (a: number, b: number, t: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};

const poseBetween = (front: Vec2, rear: Vec2) => ({
  x: (front.x + rear.x) / 2,
  z: (front.z + rear.z) / 2,
  heading: Math.atan2(front.z - rear.z, front.x - rear.x),
});

/** Builds the full GoldLane hub (layout/hub.ts) and its fleet. */
export function createSim(config: SimConfig): Sim {
  const rng = createRng(config.seed);
  const gen = createDataGen(rng, brand);
  const r = {
    maintenanceChance: config.rateOverrides?.maintenanceChance ?? defaultRates.maintenanceChance,
    severeChance: config.rateOverrides?.severeChance ?? defaultRates.severeChance,
    meanRentalSimSec: config.rateOverrides?.meanRentalSimSec ?? defaultRates.meanRentalSimSec,
    pickupsPerSimHour: config.rateOverrides?.pickupsPerSimHour ?? defaultRates.pickupsPerSimHour,
  };
  const graph = hubGraph();
  const engine = createTrafficEngine(graph, { lookAhead: defaultRates.lookAheadM });
  const rent = createRentPool();

  let weatherMode: WeatherMode = config.weather ?? 'clear';
  let timeScale = config.timeScale ?? defaultRates.timeScale;
  let tick = 0;
  let now = -PREROLL_STEPS * defaultRates.stepWallSec * timeScale;
  let events: SimEvent[] = [];
  const turnarounds: TurnaroundRecord[] = [];

  // ---------- stations ----------

  const stationIds = Object.keys(hub.stations) as Station[];
  const pools = new Map<Station, ResourcePool>();
  const unitById = new Map<string, { station: Station; unit: UnitLayout }>();
  for (const id of stationIds) {
    const units = hub.stations[id].units;
    pools.set(id, createResourcePool(units.map((u) => (u.tag ? { id: u.id, tag: u.tag } : { id: u.id }))));
    for (const u of units) unitById.set(u.id, { station: id, unit: u });
  }
  const pool = (s: Station): ResourcePool => pools.get(s) as ResourcePool;
  const unitOf = (unitId: string): UnitLayout => (unitById.get(unitId) as { unit: UnitLayout }).unit;
  const queueEdge = (s: Station): string => hub.stations[s].queueEdge as string;
  const chargerKw = new Map<string, number>(hub.stations.charger.units.map((u) => [u.id, gen.chargeRateKw()]));
  const overflowing = new Set<Station>();
  const pending: PendingRelease[] = [];

  // ---------- agents ----------

  const vehicles = new Map<string, Vehicle>();
  const customers: Customer[] = [];
  const pedestrians = new Map<string, string>(); // pedestrian id → vehicle id
  let pedCounter = 0;
  const shuttles: Shuttle[] = [];
  const patrols: Patrol[] = [];
  const tow: Tow = { id: 'tow-1', phase: 'depot', carId: null, unitId: null, travelledSinceAttach: 0 };
  const towJobs: string[] = [];

  const fleetSpec = (v: Vehicle, route: readonly string[]): MoverSpec => ({
    id: v.id,
    kind: 'fleet',
    route,
    length: dimensions[v.cls].length,
    width: dimensions[v.cls].width,
    priority: priority.fleet,
    idm: idm.road,
  });

  const emit = (e: SimEvent): void => {
    events.push(e);
  };

  function transition(v: Vehicle, to: VehicleState): void {
    const m = milestoneFor(v.state, to);
    v.state = to;
    if (m) {
      v.stage = m;
      emit({ type: 'milestone', vehicleId: v.id, stage: m, simTimeSec: now });
    }
  }

  const view = (id: string): MoverView | null => engine.mover(id);
  const currentEdge = (id: string): string => (view(id) as MoverView).edgeId;

  function routeTo(v: Vehicle, target: string): void {
    const route = graph.route(currentEdge(v.id), target, 'fleet');
    if (!route) throw new Error(`No fleet route from ${currentEdge(v.id)} to ${target}`);
    engine.setRoute(v.id, route);
  }

  function leaveUnit(v: Vehicle, station: Station, unitId: string): void {
    pending.push({ vehicleId: v.id, station, unitId, edge: unitOf(unitId).parkEdge });
  }

  const energyStation = (v: Vehicle): Station => (v.cls === 'ev' ? 'charger' : 'pump');

  function goToQueue(v: Vehicle, station: Station): void {
    routeTo(v, queueEdge(station));
    v.phase = { kind: 'toQueue', station };
  }

  const uniform = (range: { readonly min: number; readonly max: number }): number => rng.range(range.min, range.max);

  // ---------- fleet setup ----------

  const counts: Record<VehicleClass, number> = {
    ev: Math.round(facility.fleetSize * facility.fleetMix.ev),
    suv: Math.round(facility.fleetSize * facility.fleetMix.suv),
    sedan: 0,
  };
  counts.sedan = facility.fleetSize - counts.ev - counts.suv;
  const classes: VehicleClass[] = [];
  for (const cls of ['sedan', 'suv', 'ev'] as const) for (let i = 0; i < counts[cls]; i++) classes.push(cls);
  for (let i = classes.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [classes[i], classes[j]] = [classes[j] as VehicleClass, classes[i] as VehicleClass];
  }

  const staged: Record<VehicleClass, number> = { sedan: 0, suv: 0, ev: 0 };
  for (const cls of classes) {
    const v: Vehicle = {
      id: gen.vehicleId(),
      cls,
      plate: gen.plate(),
      state: 'onRent',
      phase: { kind: 'offMap' },
      stage: null,
      odometerMi: gen.odometerMi(),
      fuelPct: cls === 'ev' ? null : 100,
      socPct: cls === 'ev' ? rng.range(80, 100) : null,
      energyStart: 0,
      energyTarget: 0,
      maintenance: false,
      severe: false,
      serviced: false,
      washed: false,
      returnedAt: null,
      customerId: null,
      agreementNo: null,
      tier: null,
      parkedPose: null,
    };
    vehicles.set(v.id, v);
    if (staged[cls] < INITIAL_STAGED[cls]) {
      const slots = pool('slot');
      slots.enqueue(v.id, cls);
      const grant = slots.allocate()[0];
      if (grant) {
        const park = unitOf(grant.unitId).parkEdge;
        if (engine.spawn(fleetSpec(v, [park]), graph.edge(park).length)) {
          staged[cls]++;
          v.state = 'staged';
          v.stage = 'staged';
          v.phase = { kind: 'staged', unitId: grant.unitId };
          continue;
        }
        slots.release(grant.unitId);
      }
    }
    rent.add(v.id, now, rng.exponential(r.meanRentalSimSec) / weatherTable[weatherMode].demandFactor);
  }

  // Shuttles, carts, van and the tow truck.
  const shuttleSpec = (id: string, route: readonly string[]): MoverSpec => ({
    id,
    kind: 'shuttle',
    route,
    length: dimensions.shuttle.length,
    width: dimensions.shuttle.width,
    priority: priority.shuttle,
    idm: idm.shuttle,
  });
  const [shA, shB, shC, shD] = hub.shuttle.loop as [string, string, string, string];
  engine.spawn(shuttleSpec('shuttle-1', [shA, shB]));
  engine.spawn(shuttleSpec('shuttle-2', [shC, shD, shA, shB]));
  shuttles.push({ id: 'shuttle-1', dwellUntil: null }, { id: 'shuttle-2', dwellUntil: null });

  const loop = hub.serviceLoop;
  const patrolStarts: [string, 'cart' | 'van', number][] = [
    ['cart-1', 'cart', 0],
    ['cart-2', 'cart', 3],
    ['cart-3', 'cart', 6],
    ['van-1', 'van', 8],
  ];
  for (const [id, kind, at] of patrolStarts) {
    const route = [...loop.slice(at), ...loop, ...loop];
    engine.spawn({
      id,
      kind,
      route,
      length: dimensions[kind].length,
      width: dimensions[kind].width,
      priority: priority[kind],
      idm: kind === 'cart' ? idm.cart : idm.road,
    });
    patrols.push({ id, lastEdge: route[0] as string });
  }

  engine.spawn(
    {
      id: tow.id,
      kind: 'tow',
      route: [hub.tow.depotEdge],
      length: dimensions.tow.length,
      width: dimensions.tow.width,
      priority: priority.tow,
      idm: idm.road,
    },
    graph.edge(hub.tow.depotEdge).length,
  );

  // ---------- per-step logic ----------

  function admitReturns(): void {
    const due = rent.due(now, 1);
    for (const id of due) {
      const v = vehicles.get(id) as Vehicle;
      if (!engine.spawn(fleetSpec(v, [hub.entryEdge]))) {
        rent.add(id, now, 0);
        continue;
      }
      v.state = 'arriving';
      v.stage = null;
      v.maintenance = v.severe = v.serviced = v.washed = false;
      v.returnedAt = null;
      v.customerId = v.agreementNo = v.tier = null;
      v.odometerMi += rng.int(defaultRates.rentalMiles.min, defaultRates.rentalMiles.max);
      if (v.cls === 'ev') v.socPct = uniform(defaultRates.returnSocPct);
      else v.fuelPct = uniform(defaultRates.returnFuelPct);
      v.phase = { kind: 'toQueue', station: 'returnLane' };
    }
  }

  function serveCustomers(dtSim: number): void {
    const arrivals = pickupArrivals(rng, r.pickupsPerSimHour, dtSim, weatherTable[weatherMode].demandFactor);
    for (let i = 0; i < arrivals; i++) {
      const roll = rng.next();
      const cls: VehicleClass = roll < facility.fleetMix.ev ? 'ev' : roll < facility.fleetMix.ev + facility.fleetMix.suv ? 'suv' : 'sedan';
      customers.push({ cls, tier: gen.tier() });
    }
    while (customers.length > 0) {
      const c = customers[0] as Customer;
      const free = [...vehicles.values()].filter((v) => v.phase.kind === 'staged' && v.customerId === null);
      const car = free.find((v) => v.cls === c.cls) ?? free[0];
      if (!car) return;
      const pedId = `ped-${String(++pedCounter)}`;
      const spawned = engine.spawn({
        id: pedId,
        kind: 'pedestrian',
        route: hub.walkway.routes[car.cls],
        length: dimensions.pedestrian.length,
        width: dimensions.pedestrian.width,
        priority: priority.pedestrian,
        idm: idm.pedestrian,
      });
      if (!spawned) {
        pedCounter--;
        return;
      }
      customers.shift();
      car.customerId = pedId;
      car.tier = c.tier;
      pedestrians.set(pedId, car.id);
    }
  }

  function startWork(v: Vehicle, station: Station, unitId: string): void {
    const at = (until: number): Phase => ({ kind: 'working', station, unitId, start: now, until });
    switch (station) {
      case 'returnLane':
        transition(v, 'inspecting');
        v.returnedAt = now;
        v.phase = at(now + uniform(defaultRates.inspectionSimSec));
        return;
      case 'wash':
        transition(v, 'washing');
        v.phase = at(now + uniform(defaultRates.washSimSec));
        return;
      case 'service':
        transition(v, 'inService');
        v.phase = at(now + uniform(defaultRates.serviceSimSec));
        return;
      case 'charger':
      case 'pump':
        transition(v, 'energising');
        v.energyStart = (v.cls === 'ev' ? v.socPct : v.fuelPct) ?? 0;
        v.energyTarget = v.cls === 'ev' ? Math.max(v.energyStart, defaultRates.evStageSocPct + rng.int(0, 15)) : 100;
        v.phase = at(Number.POSITIVE_INFINITY);
        return;
      case 'slot':
        transition(v, 'staged');
        if (v.returnedAt !== null) turnarounds.push({ returnedAt: v.returnedAt, stagedAt: now });
        v.phase = { kind: 'staged', unitId };
        return;
      case 'gate':
        v.phase = at(now + uniform(GATE_DWELL));
        return;
      case 'towBay':
        v.phase = { kind: 'towWait', unitId };
        towJobs.push(v.id);
        return;
    }
  }

  function finishWork(v: Vehicle, phase: Extract<Phase, { kind: 'working' }>): void {
    const { station, unitId } = phase;
    switch (station) {
      case 'returnLane': {
        v.maintenance = rng.chance(r.maintenanceChance);
        v.severe = v.maintenance && rng.chance(r.severeChance);
        if (v.maintenance) {
          emit({ type: 'maintenanceFlagged', vehicleId: v.id, reason: rng.pick(['tyres', 'oil', 'damage'] as const), severe: v.severe, simTimeSec: now });
        }
        if (v.severe) {
          transition(v, 'awaitingTow');
          pool('towBay').enqueue(v.id);
          v.phase = { kind: 'awaitGrant', station: 'towBay', since: now, tagged: false };
          return;
        }
        transition(v, 'washQueue');
        leaveUnit(v, station, unitId);
        goToQueue(v, 'wash');
        return;
      }
      case 'wash':
        v.washed = true;
        leaveUnit(v, station, unitId);
        if (v.maintenance && !v.serviced) {
          transition(v, 'serviceQueue');
          goToQueue(v, 'service');
        } else {
          transition(v, 'energyQueue');
          goToQueue(v, energyStation(v));
        }
        return;
      case 'service':
        if (phase.detailing) {
          v.washed = true;
          transition(v, 'energyQueue');
          leaveUnit(v, station, unitId);
          goToQueue(v, energyStation(v));
          return;
        }
        v.serviced = true;
        if (!v.washed) {
          // Severe path: detailed in the service bay (requirements L-1 severe; architecture §11 note).
          transition(v, 'washQueue');
          transition(v, 'washing');
          v.phase = { kind: 'working', station, unitId, start: now, until: now + uniform(defaultRates.washSimSec), detailing: true };
          return;
        }
        transition(v, 'energyQueue');
        leaveUnit(v, station, unitId);
        goToQueue(v, energyStation(v));
        return;
      case 'charger':
      case 'pump':
        transition(v, 'toLot');
        leaveUnit(v, station, unitId);
        goToQueue(v, 'slot');
        return;
      case 'gate':
        emit({
          type: 'checkout',
          vehicleId: v.id,
          agreementNo: v.agreementNo ?? gen.agreementNo(AGREEMENT_YEAR),
          tier: v.tier ?? gen.tier(),
          gateId: unitId,
          simTimeSec: now,
        });
        leaveUnit(v, station, unitId);
        routeTo(v, hub.exitEdge);
        v.phase = { kind: 'exiting' };
        return;
      case 'slot':
      case 'towBay':
        return;
    }
  }

  function updateVehicle(v: Vehicle, dtSim: number): void {
    const phase = v.phase;
    if (phase.kind === 'offMap' || phase.kind === 'towed') return;
    const mv = view(v.id);
    if (!mv) return;
    switch (phase.kind) {
      case 'toQueue':
        // The first car in line on the queue lane requests a unit while still rolling.
        if (mv.edgeId === queueEdge(phase.station) && (queueHeadS.get(phase.station) ?? -Infinity) <= mv.s) {
          const tag = phase.station === 'slot' ? v.cls : undefined;
          pool(phase.station).enqueue(v.id, tag);
          v.phase = { kind: 'awaitGrant', station: phase.station, since: now, tagged: tag !== undefined };
        }
        return;
      case 'awaitGrant':
        if (phase.station === 'slot' && phase.tagged && now - phase.since > SLOT_FALLBACK_SEC && pool('slot').freeCount() > 0) {
          pool('slot').cancel(v.id);
          pool('slot').enqueue(v.id);
          v.phase = { ...phase, tagged: false };
        }
        return;
      case 'toUnit':
        if (mv.finished && mv.edgeId === unitOf(phase.unitId).parkEdge) startWork(v, phase.station, phase.unitId);
        return;
      case 'working': {
        if (phase.station === 'charger') {
          const kw = (chargerKw.get(phase.unitId) ?? energy.chargerKw.min) * weatherTable[weatherMode].chargeFactor;
          v.socPct = chargeSoc(v.socPct ?? 0, kw, energy.evPackKwh, dtSim);
          if (v.socPct >= v.energyTarget) finishWork(v, phase);
          return;
        }
        if (phase.station === 'pump') {
          v.fuelPct = refuel(v.fuelPct ?? 0, energy.pumpLitresPerMin, energy.fuelTankL, dtSim);
          if (v.fuelPct >= v.energyTarget) finishWork(v, phase);
          return;
        }
        if (now >= phase.until) finishWork(v, phase);
        return;
      }
      case 'staged':
      case 'towWait':
        return;
      case 'exiting':
        if (mv.finished && mv.edgeId === hub.exitEdge) {
          engine.remove(v.id);
          transition(v, 'onRent');
          v.phase = { kind: 'offMap' };
          // Heatwave: returns come back sooner as well as pickups rising (X-1).
          const factor = weatherTable[weatherMode].demandFactor;
          rent.add(v.id, now, rentalDuration(rng, r.meanRentalSimSec, defaultRates.minRentalSimSec) / factor);
        }
        return;
    }
  }

  function handleGrants(): void {
    for (const id of stationIds) {
      for (const { agentId, unitId } of pool(id).allocate()) {
        const v = vehicles.get(agentId) as Vehicle;
        if (v.phase.kind === 'towed') {
          // The tow truck takes the car into the service bay and stops just past it.
          const route = graph.route(currentEdge(tow.id), unitOf(unitId).beyondEdge as string, 'tow');
          if (!route) throw new Error('No tow route to the service bay');
          engine.setRoute(tow.id, route);
          tow.phase = 'toBay';
          tow.unitId = unitId;
          continue;
        }
        if (v.phase.kind === 'awaitGrant' && v.phase.station === 'towBay') {
          const lane = hub.stations.returnLane.units.find((u) => u.parkEdge === currentEdge(v.id));
          if (lane) leaveUnit(v, 'returnLane', lane.id);
        }
        routeTo(v, unitOf(unitId).parkEdge);
        v.phase = { kind: 'toUnit', station: id, unitId };
      }
    }
  }

  function processReleases(): void {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i] as PendingRelease;
      if (!engine.occupies(p.vehicleId, p.edge)) {
        pool(p.station).release(p.unitId);
        pending.splice(i, 1);
      }
    }
  }

  function updatePedestrians(): void {
    for (const [pedId, carId] of [...pedestrians]) {
      const mv = view(pedId);
      if (!mv?.finished) continue;
      engine.remove(pedId);
      pedestrians.delete(pedId);
      const car = vehicles.get(carId) as Vehicle;
      if (car.phase.kind !== 'staged') continue;
      const unitId = car.phase.unitId;
      transition(car, 'departing');
      car.agreementNo = gen.agreementNo(AGREEMENT_YEAR);
      leaveUnit(car, 'slot', unitId);
      goToQueue(car, 'gate');
    }
  }

  function updateTow(dtWall: number): void {
    const mv = view(tow.id);
    if (!mv) return;
    if (tow.carId !== null) tow.travelledSinceAttach += mv.speed * dtWall;
    switch (tow.phase) {
      case 'depot': {
        const job = towJobs[0];
        if (job === undefined || !mv.finished) return;
        const route = graph.route(mv.edgeId, hub.tow.stopEdge, 'tow');
        if (!route) throw new Error('No tow route to the tow bay');
        engine.setRoute(tow.id, route);
        tow.phase = 'toPickup';
        emit({ type: 'towDispatched', vehicleId: job, towId: tow.id, simTimeSec: now });
        return;
      }
      case 'toPickup': {
        if (!mv.finished) return;
        const carId = towJobs.shift() as string;
        const car = vehicles.get(carId) as Vehicle;
        const carView = view(carId) as MoverView;
        car.parkedPose = { x: carView.x, z: carView.z, heading: carView.heading };
        if (car.phase.kind === 'towWait') pool('towBay').release(car.phase.unitId);
        engine.remove(carId);
        engine.setLength(tow.id, hub.tow.carryLength);
        transition(car, 'beingTowed');
        car.phase = { kind: 'towed', towId: tow.id };
        tow.carId = carId;
        tow.travelledSinceAttach = 0;
        const route = graph.route(mv.edgeId, queueEdge('service'), 'tow');
        if (!route) throw new Error('No tow route to the service queue');
        engine.setRoute(tow.id, route);
        tow.phase = 'toQueue';
        return;
      }
      case 'toQueue':
        if (mv.finished && mv.edgeId === queueEdge('service') && tow.carId !== null) {
          pool('service').enqueue(tow.carId);
          tow.phase = 'awaitBay';
        }
        return;
      case 'awaitBay':
        return;
      case 'toBay': {
        if (!mv.finished || tow.carId === null || tow.unitId === null) return;
        const unit = unitOf(tow.unitId);
        const car = vehicles.get(tow.carId) as Vehicle;
        engine.setLength(tow.id, dimensions.tow.length);
        const park = unit.parkEdge;
        if (!engine.spawn(fleetSpec(car, [park]), graph.edge(park).length)) {
          engine.setLength(tow.id, hub.tow.carryLength);
          return;
        }
        car.parkedPose = null;
        startWork(car, 'service', tow.unitId);
        tow.carId = null;
        tow.unitId = null;
        const route = graph.route(mv.edgeId, hub.tow.depotEdge, 'tow');
        if (!route) throw new Error('No tow route back to the depot');
        engine.setRoute(tow.id, route);
        tow.phase = 'returning';
        return;
      }
      case 'returning':
        if (mv.finished && mv.edgeId === hub.tow.depotEdge) tow.phase = 'depot';
        return;
    }
  }

  function updateShuttles(): void {
    for (const s of shuttles) {
      const mv = view(s.id);
      if (!mv?.finished) continue;
      if (s.dwellUntil === null) {
        s.dwellUntil = now + uniform(SHUTTLE_DWELL);
      } else if (now >= s.dwellUntil) {
        s.dwellUntil = null;
        engine.setRoute(s.id, [shB, shC, shD, shA, shB]);
      }
    }
  }

  function updatePatrols(): void {
    for (const p of patrols) {
      const mv = view(p.id);
      if (!mv || mv.edgeId === p.lastEdge) continue;
      p.lastEdge = mv.edgeId;
      // Keep at least one full lap ahead so patrols never stop at a route end.
      if (mv.edgeId === loop[0]) engine.setRoute(p.id, [...loop, ...loop]);
    }
  }

  function waitingAt(station: Station): number {
    let n = 0;
    for (const v of vehicles.values()) {
      if ((v.phase.kind === 'toQueue' || v.phase.kind === 'awaitGrant') && v.phase.station === station) n++;
    }
    return n;
  }

  function checkOverflow(): void {
    for (const s of ['wash', 'service', 'charger', 'pump', 'slot', 'gate'] as const) {
      const n = waitingAt(s);
      if (n > QUEUE_OVERFLOW && !overflowing.has(s)) {
        overflowing.add(s);
        emit({ type: 'queueOverflow', resource: s, length: n, simTimeSec: now });
      } else if (n <= QUEUE_OVERFLOW) {
        overflowing.delete(s);
      }
    }
  }

  /** Front position of the leading car per station queue lane (cars waiting or heading there). */
  const queueHeadS = new Map<Station, number>();

  function measureQueues(): void {
    queueHeadS.clear();
    for (const v of vehicles.values()) {
      if (v.phase.kind !== 'awaitGrant' && v.phase.kind !== 'toQueue') continue;
      const station = v.phase.station;
      const mv = view(v.id);
      if (!mv || mv.edgeId !== hub.stations[station].queueEdge) continue;
      // A car still heading there only blocks those behind it once someone ahead is waiting.
      const s = v.phase.kind === 'awaitGrant' ? mv.s : mv.s - 1e-6;
      queueHeadS.set(station, Math.max(queueHeadS.get(station) ?? -Infinity, s));
    }
  }

  function step(): void {
    const dtWall = defaultRates.stepWallSec;
    const dtSim = dtWall * timeScale;
    tick++;
    now += dtSim;
    admitReturns();
    serveCustomers(dtSim);
    engine.step(dtWall, weatherTable[weatherMode].speedFactor);
    measureQueues();
    for (const v of vehicles.values()) updateVehicle(v, dtSim);
    updatePedestrians();
    updateTow(dtWall);
    handleGrants();
    processReleases();
    updateShuttles();
    updatePatrols();
    checkOverflow();
  }

  // ---------- views ----------

  function towedPose(car: Vehicle): { x: number; z: number; heading: number } {
    const carLength = dimensions[car.cls].length;
    const front = engine.pointBehind(tow.id, dimensions.tow.length + hub.tow.gap);
    const rear = engine.pointBehind(tow.id, dimensions.tow.length + hub.tow.gap + carLength);
    const track = poseBetween(front, rear);
    const from = car.parkedPose;
    if (!from || tow.travelledSinceAttach >= TOW_BLEND_M) return track;
    const t = tow.travelledSinceAttach / TOW_BLEND_M;
    return { x: from.x + (track.x - from.x) * t, z: from.z + (track.z - from.z) * t, heading: shortest(from.heading, track.heading, t) };
  }

  function towTruckPose(mv: MoverView): { x: number; z: number; heading: number } {
    if (tow.carId === null) return { x: mv.x, z: mv.z, heading: mv.heading };
    return poseBetween(engine.pointBehind(tow.id, 0), engine.pointBehind(tow.id, dimensions.tow.length));
  }

  function vehicleTask(v: Vehicle): { task: string; eta: number | null } {
    const p = v.phase;
    switch (p.kind) {
      case 'toQueue':
        return { task: `Heading to ${p.station} queue`, eta: null };
      case 'awaitGrant':
        return { task: `Waiting for ${p.station}`, eta: null };
      case 'toUnit':
        return { task: `Driving to ${p.unitId}`, eta: null };
      case 'working': {
        if (p.station === 'charger') {
          const kw = (chargerKw.get(p.unitId) ?? energy.chargerKw.min) * weatherTable[weatherMode].chargeFactor;
          return { task: `Charging at ${p.unitId}`, eta: secondsToSoc(v.socPct ?? 0, v.energyTarget, kw, energy.evPackKwh) };
        }
        if (p.station === 'pump') return { task: `Refuelling at ${p.unitId}`, eta: null };
        const verb = p.detailing ? 'Detailing' : { returnLane: 'Inspecting', wash: 'Washing', service: 'Servicing', gate: 'Checking out', slot: '', towBay: '' }[p.station];
        return { task: `${verb} at ${p.unitId}`, eta: Math.max(0, p.until - now) };
      }
      case 'staged':
        return { task: v.customerId ? 'Customer on the way' : `Ready at ${p.unitId}`, eta: null };
      case 'towWait':
        return { task: 'Waiting for tow', eta: null };
      case 'towed':
        return { task: 'Being towed to service', eta: null };
      case 'exiting':
        return { task: 'Leaving the hub', eta: null };
      case 'offMap':
        return { task: 'On rent', eta: null };
    }
  }

  function fleetView(v: Vehicle): AgentView | null {
    let pose: { x: number; z: number; heading: number };
    let speed: number;
    let parentId: string | null = null;
    if (v.phase.kind === 'towed') {
      pose = towedPose(v);
      speed = view(tow.id)?.speed ?? 0;
      parentId = tow.id;
    } else {
      const mv = view(v.id);
      if (!mv) return null;
      pose = { x: mv.x, z: mv.z, heading: mv.heading };
      speed = mv.speed;
    }
    const { task, eta } = vehicleTask(v);
    const parked =
      isParkedState(v.state) ||
      QUEUE_STATES.has(v.state) ||
      v.phase.kind === 'awaitGrant' ||
      v.phase.kind === 'toQueue' ||
      v.phase.kind === 'working' ||
      v.phase.kind === 'staged';
    return {
      id: v.id,
      kind: 'fleet',
      cls: v.cls,
      ...pose,
      speed,
      length: dimensions[v.cls].length,
      width: dimensions[v.cls].width,
      // A granted car should be moving, except one bound for the tow bay: its path runs
      // through the wash queue road, so it waits like the queued cars around it.
      parked: v.state === 'awaitingTow' || (parked && v.phase.kind !== 'toUnit' && v.phase.kind !== 'exiting'),
      state: v.state,
      stage: v.stage,
      plate: v.plate,
      agreementNo: v.state === 'departing' ? v.agreementNo : null,
      fuelPct: v.fuelPct,
      socPct: v.socPct,
      odometerMi: v.odometerMi,
      task,
      etaSimSec: eta,
      parentId,
    };
  }

  function otherView(mv: MoverView): AgentView {
    let task = 'Patrolling the service road';
    let parked = false;
    let pose = { x: mv.x, z: mv.z, heading: mv.heading };
    let length = mv.length;
    if (mv.kind === 'shuttle') {
      parked = mv.finished;
      task = mv.finished ? 'Boarding at the terminal kerb' : 'Airport loop';
    } else if (mv.kind === 'pedestrian') {
      task = 'Walking to their car';
    } else if (mv.kind === 'tow') {
      pose = towTruckPose(mv);
      length = dimensions.tow.length;
      parked = mv.finished;
      task = { depot: 'Standing by at the depot', toPickup: 'Dispatched to the tow bay', toQueue: 'Towing to service', awaitBay: 'Waiting for a service bay', toBay: 'Towing into a service bay', returning: 'Returning to the depot' }[tow.phase];
    }
    return {
      id: mv.id,
      kind: mv.kind,
      cls: null,
      ...pose,
      speed: mv.speed,
      length,
      width: mv.width,
      parked,
      state: null,
      stage: null,
      plate: null,
      agreementNo: null,
      fuelPct: null,
      socPct: null,
      odometerMi: null,
      task,
      etaSimSec: null,
      parentId: null,
    };
  }

  function agents(): AgentView[] {
    const out: AgentView[] = [];
    for (const v of vehicles.values()) {
      if (v.phase.kind === 'offMap') continue;
      const a = fleetView(v);
      if (a) out.push(a);
    }
    for (const mv of engine.movers()) if (mv.kind !== 'fleet') out.push(otherView(mv));
    return out;
  }

  function resources(): ResourceView[] {
    const out: ResourceView[] = [];
    for (const id of stationIds) {
      if (id === 'towBay') continue;
      const queueLength = waitingAt(id);
      for (const u of hub.stations[id].units) {
        const occupantId = pool(id).occupant(u.id);
        let progress: number | null = null;
        const occ = occupantId ? vehicles.get(occupantId) : undefined;
        if (occ?.phase.kind === 'working' && occ.phase.unitId === u.id) {
          if (id === 'charger' || id === 'pump') {
            const level = (occ.cls === 'ev' ? occ.socPct : occ.fuelPct) ?? 0;
            const span = occ.energyTarget - occ.energyStart;
            progress = span <= 0 ? 1 : Math.min(1, Math.max(0, (level - occ.energyStart) / span));
          } else {
            progress = Math.min(1, Math.max(0, (now - occ.phase.start) / (occ.phase.until - occ.phase.start)));
          }
        }
        out.push({ id: u.id, kind: id, occupantId, queueLength, progress });
      }
    }
    return out;
  }

  // ---------- warm start ----------

  for (let i = 0; i < PREROLL_STEPS; i++) step();
  now = 0;
  tick = 0;
  events = [];

  return {
    step,
    snapshot() {
      const hours = (((START_HOUR * 3600 + now) / 3600) % 24 + 24) % 24;
      return { tick, simTimeSec: now, clockHours: hours, weather: weatherMode, timeScale, agents: agents(), resources: resources() };
    },
    metrics() {
      const fleetOnMap = [...vehicles.values()].filter((v) => v.phase.kind !== 'offMap');
      const stageCounts = Object.fromEntries(TRACKER_STAGES.map((s) => [s, 0])) as Record<TrackerStage, number>;
      for (const v of fleetOnMap) if (v.stage) stageCounts[v.stage]++;
      const ready = fleetOnMap.filter((v) => v.state === 'staged').length;
      const departing = fleetOnMap.filter((v) => v.state === 'departing').length;
      return {
        turnaroundMin: averageTurnaroundMin(turnarounds, now, TURNAROUND_WINDOW_SEC),
        utilisation: utilisation(rent.size, facility.fleetSize),
        readyEvSocPct: averageReadyEvSoc(fleetOnMap.map((v) => ({ cls: v.cls, state: v.state, socPct: v.socPct }))),
        counts: { total: facility.fleetSize, onRent: rent.size, ready, inTurnaround: fleetOnMap.length - ready - departing },
        stageCounts,
      };
    },
    apply(command) {
      if (command.type === 'setWeather') weatherMode = command.mode;
      else timeScale = command.value;
    },
    drainEvents() {
      const out = events;
      events = [];
      return out;
    },
    footprints() {
      return agents().map((a) => ({
        id: a.id,
        x: a.x,
        z: a.z,
        heading: a.heading,
        length: a.length,
        width: a.width,
        ...(a.parentId ? { parentId: a.parentId } : {}),
      }));
    },
  };
}
