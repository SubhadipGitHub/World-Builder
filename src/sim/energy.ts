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
