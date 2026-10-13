import { unitStop, type Pose } from '../layout/positions';
import type { AgentView, ResourceView, Snapshot } from '../sim/world';

/** The gate arm stands this far past the stop line, where a checking-out car's front waits. */
export const GATE_ARM_AHEAD_M = 1.4;
/** The arm starts lifting this far into the checkout dwell, so it is up before the car pulls away. */
export const BARRIER_LIFT_AT = 0.8;
/** The arm stays up until the departing car's rear is this far past it. */
export const BARRIER_CLEAR_M = 1;
/** Cars further than this sideways from a gate lane's centre line are in another lane (lanes are 6 m apart). */
const GATE_LANE_M = 2.5;
/** Tolerance on "front at the stop line". */
const STOP_EPS_M = 0.05;

const stops = new Map<string, Pose>();
const stopOf = (id: string): Pose => {
  let s = stops.get(id);
  if (!s) stops.set(id, (s = unitStop(id)));
  return s;
};

/**
 * Exit-gate arm (V-9): down while a car drives up and checks out, lifting near the end of checkout,
 * and up until the departing car's rear has cleared the arm. The sim releases the gate as soon as
 * the car's front leaves the lane (R-1), so the departure is tracked from agent positions.
 */
function barrierUp(r: ResourceView, agents: readonly AgentView[]): boolean {
  const checkingOut = r.occupantId !== null && r.progress !== null;
  if (checkingOut && r.progress >= BARRIER_LIFT_AT) return true;
  const stop = stopOf(r.id);
  const dx = Math.cos(stop.heading);
  const dz = Math.sin(stop.heading);
  return agents.some((a) => {
    if (a.kind === 'pedestrian' || (checkingOut && a.id === r.occupantId)) return false;
    const rx = a.x - stop.x;
    const rz = a.z - stop.z;
    if (Math.abs(rz * dx - rx * dz) > GATE_LANE_M) return false;
    const along = rx * dx + rz * dz;
    return along + a.length / 2 >= -STOP_EPS_M && along - a.length / 2 <= GATE_ARM_AHEAD_M + BARRIER_CLEAR_M;
  });
}

export interface DetailStates {
  /** Wash units whose brushes spin: occupied and mid-cycle (progress set). */
  readonly spinningWash: ReadonlySet<string>;
  /** Service bays whose roll-up door is open: occupied. */
  readonly openDoors: ReadonlySet<string>;
  /** Gates whose barrier is up: late in checkout, or a departing car is still passing the arm. */
  readonly raisedBarriers: ReadonlySet<string>;
  /** Every charger: 'charging' while occupied and mid-cycle, else 'idle'. */
  readonly chargers: ReadonlyMap<string, 'idle' | 'charging'>;
  /** The tow truck's beacon flashes while it carries a car. */
  readonly towBeacon: boolean;
  /** Units taken offline (S-2): hazard cones and a red status light. */
  readonly offlineUnits: ReadonlySet<string>;
}

/** Live building details from existing snapshot data (V-9, P9); no simulation changes. */
export function detailStates(snapshot: Snapshot): DetailStates {
  const spinningWash = new Set<string>();
  const openDoors = new Set<string>();
  const raisedBarriers = new Set<string>();
  const chargers = new Map<string, 'idle' | 'charging'>();
  const offlineUnits = new Set<string>();
  for (const r of snapshot.resources) {
    if (!r.online) offlineUnits.add(r.id);
    const occupied = r.occupantId !== null;
    switch (r.kind) {
      case 'wash':
        if (occupied && r.progress !== null) spinningWash.add(r.id);
        break;
      case 'service':
        if (occupied) openDoors.add(r.id);
        break;
      case 'gate':
        if (barrierUp(r, snapshot.agents)) raisedBarriers.add(r.id);
        break;
      case 'charger':
        chargers.set(r.id, occupied && r.progress !== null ? 'charging' : 'idle');
        break;
      default:
        break;
    }
  }
  return { spinningWash, openDoors, raisedBarriers, chargers, towBeacon: snapshot.agents.some((a) => a.parentId !== null), offlineUnits };
}
