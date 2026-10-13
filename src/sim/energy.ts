/** New state of charge after charging at constant power for dt simulated seconds, capped at 100. */
export function chargeSoc(socPct: number, powerKw: number, packKwh: number, dtSimSec: number): number {
  const added = ((powerKw * Math.max(0, dtSimSec)) / 3600 / packKwh) * 100;
  return Math.min(100, socPct + added);
}

/** Simulated seconds to charge from one SoC to another; 0 if already there. */
export function secondsToSoc(fromPct: number, toPct: number, powerKw: number, packKwh: number): number {
  if (fromPct >= toPct) return 0;
  return (((toPct - fromPct) / 100) * packKwh * 3600) / powerKw;
}

/** New fuel level after pumping for dt simulated seconds, capped at 100. */
export function refuel(fuelPct: number, litresPerMin: number, tankL: number, dtSimSec: number): number {
  const added = ((litresPerMin * Math.max(0, dtSimSec)) / 60 / tankL) * 100;
  return Math.min(100, fuelPct + added);
}

/** Charge-later policy (R-8, D33): a car at least this full may skip a long energy queue. */
export const CHARGE_LATER_LEVEL = 50;
/** …when at least this many are already waiting for that station. */
export const CHARGE_LATER_QUEUE = 4;

/** True when a washed car should skip charging/refuelling and go straight to the lot (R-8). */
export function shouldChargeLater(levelPct: number, waiting: number): boolean {
  return levelPct >= CHARGE_LATER_LEVEL && waiting >= CHARGE_LATER_QUEUE;
}
