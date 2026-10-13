import { energyOf } from '../config/fleet';
import type { VehicleState } from './lifecycle';
import type { VehicleClass } from './types';

/** KPI 2 (D8): on rent ÷ total fleet, in [0, 1]. Throws if totalFleet <= 0. */
export function utilisation(onRent: number, totalFleet: number): number {
  if (totalFleet <= 0) throw new Error('Fleet size must be positive');
  return Math.min(1, Math.max(0, onRent / totalFleet));
}

export interface TurnaroundRecord {
  readonly returnedAt: number;
  readonly stagedAt: number;
}

/**
 * KPI 1: mean minutes from returned to staged, over records staged within the
 * trailing window (now - window, now]. Null if there are none.
 */
export function averageTurnaroundMin(records: readonly TurnaroundRecord[], nowSimSec: number, windowSimSec: number): number | null {
  let sum = 0;
  let n = 0;
  for (const r of records) {
    if (r.stagedAt > nowSimSec - windowSimSec && r.stagedAt <= nowSimSec) {
      sum += r.stagedAt - r.returnedAt;
      n++;
    }
  }
  return n === 0 ? null : sum / n / 60;
}

export interface SocSample {
  readonly cls: VehicleClass;
  readonly state: VehicleState;
  readonly socPct: number | null;
}

/** KPI 3: mean SoC of EVs in the 'staged' state. Null if there are none. */
export function averageReadyEvSoc(vehicles: readonly SocSample[]): number | null {
  let sum = 0;
  let n = 0;
  for (const v of vehicles) {
    if (energyOf(v.cls) === 'electric' && v.state === 'staged' && v.socPct !== null) {
      sum += v.socPct;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

export type Trend = 'up' | 'down' | 'flat';

/** Direction of change; flat if |curr - prev| <= epsilon or either value is null. */
export function trend(prev: number | null, curr: number | null, epsilon: number): Trend {
  if (prev === null || curr === null || Math.abs(curr - prev) <= epsilon) return 'flat';
  return curr > prev ? 'up' : 'down';
}
