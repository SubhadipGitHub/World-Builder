import { sampleKeyframes, type Keyframe } from './paths';
import { airportPlan, GATE_IDS, type GateId } from './plan';

// Deterministic flight schedule (requirements F-1, F-2, architecture §19 H3–H5). Pure; visual only.
//
// Timeline per cycle c = k · CYCLE_SEC (runway 27, everything moves west on the runway):
//   arrival A_k   touches down at c, rolls west to the west-end exit (runway ≈ [c, c + 20.5]),
//                 claims the lowest free gate at c + 18 and taxis east along the apron lane.
//   departure D_k (k ≥ 1) leaves the gate held longest: pushback, north to the taxiway, east to the
//                 runway's east end, line-up at c + 46, roll west, lift off ≈ c + 70 (runway ≈ [c + 44, c + 70]).
//   extra (surge) touches down at c + 21.5 in the free runway gap; at most one per cycle.
// Arrivals only ever taxi west of their gate's column on the runway side and east on the apron lane;
// departures only ever taxi east of their gate on the taxiway, so ground paths are separated in space
// and time (unit-tested at 0.25 s over many cycles).

export type Airline = 'pacificGateway' | 'coastline' | 'sunlineCargo';
export const AIRLINES: readonly Airline[] = ['pacificGateway', 'coastline', 'sunlineCargo'];

export type FlightPhase = 'approach' | 'landing' | 'taxiIn' | 'parked' | 'pushback' | 'taxiOut' | 'takeoff' | 'climb';

export interface AircraftPose {
  readonly id: string;
  readonly airline: Airline;
  readonly x: number;
  /** Height above ground (m). */
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pitch: number;
  /** Ground speed (m/s). */
  readonly speed: number;
  /** Landing gear extension, 0 up … 1 down. */
  readonly gear: number;
  readonly phase: FlightPhase;
  /** Gate it is at or heading for; 'remote' for the remote stand; null in the air outbound. */
  readonly gate: GateId | 'remote' | null;
  readonly landingLights: boolean;
}

/** One landing or take-off every CYCLE_SEC / 2 seconds (D23). */
export const CYCLE_SEC = 80;
export const GLIDE_DEG = 3;
/** Runway 27: arrivals touch down near the east threshold, heading west. */
export const TOUCHDOWN_X = 520;
export const JET_LENGTH = 38;
export const JET_SPAN = 36;
/** Gear is down at or below this height. */
export const GEAR_DOWN_BELOW = 60;
/** Aircraft are removed after climbing out beyond this distance from the airport centre. */
export const OUT_OF_VIEW = 2000;
export const MAX_TAXI_SPEED = 16;
export const MAX_ROLL_SPEED = 85;
/** Gates occupied at t = 0 (H4). */
export const INITIAL_GATES: readonly GateId[] = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

export interface FlightSchedule {
  /** Every aircraft visible at airport time t: moving and parked. */
  aircraftAt(t: number): readonly AircraftPose[];
  /** Which aircraft holds each gate at t (null = free). */
  gatesAt(t: number): ReadonlyMap<GateId, string | null>;
  /** True while an aircraft is on the runway (landing roll, line-up or take-off roll). */
  runwayBusy(t: number): boolean;
  /**
   * Adds an arrival for a demand surge (F-2, H5); returns its approach start, within 5 s of t.
   * It lands in the first free runway window (holding on a longer approach if needed) and parks at a
   * free gate, or at a remote stand when all are full. With every stand taken it diverts (not added).
   */
  scheduleExtra(t: number): number;
}

// ---------- timing (seconds after the cycle start c) ----------

const APPROACH_SPEED = 68;
const APPROACH_SEC = 35;
const LANE_SPEED = 12;
const STAND_SPEED = 5;
const TAXIWAY_SPEED = 16;
const NORTH_SPEED = 10;
const PUSHBACK_SPEED = 5;
const CLAIM_AFTER_TOUCHDOWN = 18;
const LINEUP_AT = 46;
const ROLL_SEC = 24;
const ROLL_TOP_SPEED = 75;
const CLIMB_SPEED = 80;
const CLIMB_DEG = 8;
const EXTRA_TOUCHDOWN = 21.5;
const MAX_APPROACH_HEIGHT = 450;
/** A departure picks its gate this long before the cycle (before the earliest possible pushback). */
const DEPARTURE_PICK = -17;
const CARGO_STAND = { x: -430, z: 345 } as const;

const tanDeg = (d: number): number => Math.tan((d * Math.PI) / 180);
const hypot = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(bx - ax, bz - az);

interface Segment {
  readonly from: number;
  readonly phase: FlightPhase;
}

interface Track {
  readonly keys: readonly Keyframe[];
  /** Phase labels by start time, ascending. */
  readonly phases: readonly Segment[];
  /** Pushback segments face the other way to their motion. */
  readonly reversed?: { readonly from: number; readonly to: number };
}

interface Jet {
  readonly id: string;
  readonly airline: Airline;
  /** Arrival track (null for jets parked from the start). */
  readonly arrive: Track | null;
  /** When it appears. */
  readonly from: number;
  /** Stand it parks at, and when it holds it. */
  readonly stand: { readonly gate: GateId | 'remote'; readonly x: number; readonly z: number } | null;
  readonly claimAt: number;
  /** Departure track and its pushback start, once assigned. */
  depart: Track | null;
  departAt: number;
  /** When the departure track ends (removed). */
  goneAt: number;
}

/** Builds keyframes along a chain of legs at constant speeds. */
class Builder {
  readonly keys: Keyframe[] = [];
  readonly phases: Segment[] = [];
  constructor(
    private t: number,
    private x: number,
    private y: number,
    private z: number,
  ) {
    this.keys.push({ t, x, y, z });
  }
  get time(): number {
    return this.t;
  }
  phase(p: FlightPhase): this {
    this.phases.push({ from: this.t, phase: p });
    return this;
  }
  to(x: number, y: number, z: number, speed: number): this {
    const d = Math.hypot(x - this.x, z - this.z, y - this.y);
    this.t += d / speed;
    this.x = x;
    this.y = y;
    this.z = z;
    this.keys.push({ t: this.t, x, y, z });
    return this;
  }
  at(x: number, y: number, z: number, t: number): this {
    this.t = t;
    this.x = x;
    this.y = y;
    this.z = z;
    this.keys.push({ t, x, y, z });
    return this;
  }
}

/** Approach, landing roll, west exit, apron lane east, into the stand (nose in). */
function arrivalTrack(touchdown: number, approachStart: number, stand: { x: number; z: number }): { track: Track; parkedAt: number } {
  const plan = airportPlan();
  const rz = plan.runway.z;
  const dist = APPROACH_SPEED * (touchdown - approachStart);
  const y0 = Math.min(tanDeg(GLIDE_DEG) * dist, MAX_APPROACH_HEIGHT);
  const b = new Builder(approachStart, TOUCHDOWN_X + dist, y0, rz).phase('approach').at(TOUCHDOWN_X, 0, rz, touchdown);
  // Roll west, decelerating: 6 s at ~60, 6 s at ~36, 6 s at ~24 m/s to the exit.
  b.phase('landing').at(160, 0, rz, touchdown + 6).at(-56, 0, rz, touchdown + 12).at(-200, 0, rz, touchdown + 18);
  b.phase('taxiIn');
  for (const p of plan.rapidExit.slice(1)) b.to(p.x, 0, p.z, LANE_SPEED);
  b.to(stand.x, 0, plan.apronLane.z, LANE_SPEED).to(stand.x, 0, stand.z, STAND_SPEED);
  const parkedAt = b.time;
  b.phase('parked');
  return { track: { keys: b.keys, phases: b.phases }, parkedAt };
}

/** Pushback, north to the taxiway, east to line-up, roll west, climb out. */
function departureTrack(cycle: number, stand: { x: number; z: number }): { track: Track; start: number; end: number } {
  const plan = airportPlan();
  const tw = plan.taxiway.z;
  const lane = plan.apronLane.z;
  const rz = plan.runway.z;
  const lineupX = plan.runway.toX - 10;
  const connector = hypot(plan.taxiway.toX, tw, lineupX, rz);
  const legs = (lane - stand.z) / PUSHBACK_SPEED + (tw - lane) / NORTH_SPEED + (plan.taxiway.toX - stand.x) / TAXIWAY_SPEED + connector / (TAXIWAY_SPEED - 1);
  const lineup = cycle + LINEUP_AT;
  const start = lineup - legs;
  const b = new Builder(start, stand.x, 0, stand.z).phase('pushback').to(stand.x, 0, lane, PUSHBACK_SPEED);
  const pushEnd = b.time;
  b.phase('taxiOut').to(stand.x, 0, tw, NORTH_SPEED).to(plan.taxiway.toX, 0, tw, TAXIWAY_SPEED).to(lineupX, 0, rz, TAXIWAY_SPEED - 1);
  // Take-off roll west with constant acceleration, sampled every 2 s.
  b.phase('takeoff');
  const accel = ROLL_TOP_SPEED / ROLL_SEC;
  for (let s = 2; s <= ROLL_SEC; s += 2) b.at(lineupX - 0.5 * accel * s * s, 0, rz, lineup + s);
  const liftX = lineupX - 0.5 * accel * ROLL_SEC * ROLL_SEC;
  // Climb straight out west until beyond OUT_OF_VIEW.
  const endX = -Math.sqrt(OUT_OF_VIEW * OUT_OF_VIEW - rz * rz) + 1;
  b.phase('climb').to(endX, (liftX - endX) * tanDeg(CLIMB_DEG), rz, CLIMB_SPEED);
  return { track: { keys: b.keys, phases: b.phases, reversed: { from: start, to: pushEnd } }, start, end: b.time };
}

const phaseAt = (track: Track, t: number): FlightPhase => {
  let p: FlightPhase = track.phases[0]?.phase ?? 'parked';
  for (const s of track.phases) if (s.from <= t) p = s.phase;
  return p;
};

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function createFlightSchedule(): FlightSchedule {
  const plan = airportPlan();
  const standOf = (g: GateId): { x: number; z: number } => {
    const s = plan.gates.find((x) => x.id === g)?.stand;
    if (!s) throw new Error(`Unknown gate ${g}`);
    return s;
  };
  const remotes = [plan.remoteStand, { x: plan.remoteStand.x - 50, z: plan.remoteStand.z }];
  const extras: number[] = [];
  let built: { until: number; jets: Jet[]; holds: { gate: GateId; id: string; from: number; to: number }[] } | null = null;

  /** Replays cycles up to `until` (deterministic; rebuilt when an extra is added). */
  function build(until: number): NonNullable<typeof built> {
    if (built && built.until >= until) return built;
    const jets: Jet[] = [];
    const holds: { gate: GateId; id: string; from: number; to: number }[] = [];
    const holder = new Map<GateId, { id: string; since: number }>();
    const remoteUsed: boolean[] = remotes.map(() => false);
    INITIAL_GATES.forEach((g, i) => {
      const s = standOf(g);
      const id = `PG-${g}`;
      jets.push({ id, airline: AIRLINES[i % AIRLINES.length] ?? 'pacificGateway', arrive: null, from: -Infinity, stand: { gate: g, ...s }, claimAt: -Infinity, depart: null, departAt: Infinity, goneAt: Infinity });
      holder.set(g, { id, since: -100 + i });
    });
    jets.push({ id: 'SC-cargo', airline: 'sunlineCargo', arrive: null, from: -Infinity, stand: null, claimAt: -Infinity, depart: null, departAt: Infinity, goneAt: Infinity });
    const release = (g: GateId, at: number): void => {
      const h = holder.get(g);
      if (!h) return;
      holds.push({ gate: g, id: h.id, from: h.since, to: at });
      holder.delete(g);
    };
    const claim = (id: string, at: number): { gate: GateId | 'remote'; x: number; z: number } | null => {
      const free = GATE_IDS.find((g) => !holder.has(g));
      if (free) {
        holder.set(free, { id, since: at });
        return { gate: free, ...standOf(free) };
      }
      const r = remoteUsed.findIndex((u) => !u);
      if (r < 0) return null;
      remoteUsed[r] = true;
      const s = remotes[r] ?? plan.remoteStand;
      return { gate: 'remote', x: s.x, z: s.z };
    };
    const last = Math.ceil(until / CYCLE_SEC) + 1;
    for (let k = 0; k <= last; k++) {
      const c = k * CYCLE_SEC;
      if (k >= 1) {
        // Departure: the gate held longest at the pick time.
        let pick: GateId | null = null;
        let since = Infinity;
        for (const [g, h] of holder) {
          if (h.since <= c + DEPARTURE_PICK && h.since < since) {
            since = h.since;
            pick = g;
          }
        }
        const h = pick ? holder.get(pick) : undefined;
        const jet = h ? jets.find((j) => j.id === h.id) : undefined;
        if (pick && jet) {
          const d = departureTrack(c, standOf(pick));
          jet.depart = d.track;
          jet.departAt = d.start;
          jet.goneAt = d.end;
          release(pick, d.start);
        }
      }
      // Regular arrival.
      const arrivals: { id: string; airline: Airline; touchdown: number; approachStart: number }[] = [
        { id: `A${String(k)}`, airline: AIRLINES[k % AIRLINES.length] ?? 'pacificGateway', touchdown: c, approachStart: c - APPROACH_SEC },
      ];
      extras.forEach((start, i) => {
        const touchdown = extraTouchdown(start, i);
        if (touchdown >= c && touchdown < c + CYCLE_SEC) arrivals.push({ id: `X${String(i)}`, airline: AIRLINES[(i + 1) % AIRLINES.length] ?? 'coastline', touchdown, approachStart: start });
      });
      for (const a of arrivals) {
        const claimAt = a.touchdown + CLAIM_AFTER_TOUCHDOWN;
        const stand = claim(a.id, claimAt);
        if (!stand) continue; // Every stand taken: the extra diverts.
        const { track } = arrivalTrack(a.touchdown, a.approachStart, stand);
        jets.push({ id: a.id, airline: a.airline, arrive: track, from: a.approachStart, stand, claimAt, depart: null, departAt: Infinity, goneAt: Infinity });
      }
    }
    for (const [g, h] of holder) holds.push({ gate: g, id: h.id, from: h.since, to: Infinity });
    built = { until: last * CYCLE_SEC, jets, holds };
    return built;
  }

  /** Touchdown of extra i: the first free extra slot (one per cycle) at least an approach after its start. */
  function extraTouchdown(start: number, i: number): number {
    const taken = new Set<number>();
    for (let j = 0; j < i; j++) taken.add(Math.round(extraTouchdown(extras[j] ?? 0, j)));
    let k = Math.max(0, Math.ceil((start + APPROACH_SEC - EXTRA_TOUCHDOWN) / CYCLE_SEC));
    while (taken.has(Math.round(k * CYCLE_SEC + EXTRA_TOUCHDOWN))) k++;
    return k * CYCLE_SEC + EXTRA_TOUCHDOWN;
  }

  function pose(jet: Jet, t: number): AircraftPose | null {
    if (t < jet.from || t >= jet.goneAt) return null;
    const parked = (): AircraftPose => {
      const s = jet.stand ?? { gate: null, ...CARGO_STAND };
      return { id: jet.id, airline: jet.airline, x: s.x, y: 0, z: s.z, heading: -Math.PI / 2, pitch: 0, speed: 0, gear: 1, phase: 'parked', gate: jet.stand?.gate ?? null, landingLights: false };
    };
    let track: Track | null = null;
    if (jet.depart && t >= jet.departAt) track = jet.depart;
    else if (jet.arrive && t < (jet.arrive.keys[jet.arrive.keys.length - 1]?.t ?? -Infinity)) track = jet.arrive;
    if (!track) return parked();
    const s = sampleKeyframes(track.keys, t);
    const phase = phaseAt(track, t);
    const reversed = track.reversed && t >= track.reversed.from && t < track.reversed.to;
    // Pushback moves tail-first: the nose keeps pointing at the terminal.
    const heading = phase === 'pushback' || reversed ? -Math.PI / 2 : wrapAngle(s.heading);
    const lit = (phase === 'approach' && s.y < 150) || phase === 'landing' || phase === 'takeoff' || (phase === 'climb' && s.y < 300);
    return {
      id: jet.id,
      airline: jet.airline,
      x: s.x,
      y: s.y,
      z: s.z,
      heading,
      pitch: phase === 'pushback' ? 0 : s.pitch,
      speed: s.speed,
      gear: phase === 'climb' && s.y > GEAR_DOWN_BELOW ? 0 : 1,
      phase,
      gate: phase === 'climb' ? null : (jet.stand?.gate ?? null),
      landingLights: lit,
    };
  }

  return {
    aircraftAt(t) {
      const { jets } = build(t + CYCLE_SEC);
      const out: AircraftPose[] = [];
      for (const j of jets) {
        const p = pose(j, t);
        if (p) out.push(p);
      }
      return out;
    },
    gatesAt(t) {
      const { holds } = build(t + CYCLE_SEC);
      const out = new Map<GateId, string | null>(GATE_IDS.map((g) => [g, null]));
      for (const h of holds) if (h.from <= t && t < h.to) out.set(h.gate, h.id);
      return out;
    },
    runwayBusy(t) {
      return this.aircraftAt(t).some((a) => a.y < 2 && Math.abs(a.z - plan.runway.z) <= plan.runway.width / 2 && a.x >= plan.runway.fromX - 5 && a.x <= plan.runway.toX + 5);
    },
    scheduleExtra(t) {
      extras.push(t);
      built = null;
      return t;
    },
  };
}
