import type { Brand, Tier } from '../config/brand';
import type { Rng } from './rng';

/** Realistic but fictional data (requirements D-7, N-6). */
export interface DataGen {
  /** e.g. GL-PGW-04817. Unique per generator. */
  vehicleId(): string;
  /** e.g. 8ABC123. Unique per generator. */
  plate(): string;
  /** e.g. RA-26-0012345 for year 2026. */
  agreementNo(year: number): string;
  /** Integer in [3000, 45000]. */
  odometerMi(): number;
  tier(): Tier;
  /** Integer in [50, 250]. */
  chargeRateKw(): number;
}

/** No I, O or Q, which are easy to misread on a plate. */
const LETTERS = Array.from('ABCDEFGHJKLMNPRSTUVWXYZ');
const CHARGER_RATINGS = [50, 120, 150, 250] as const;

const digits = (rng: Rng, n: number): string => String(rng.int(0, 10 ** n - 1)).padStart(n, '0');

export function createDataGen(rng: Rng, brand: Brand): DataGen {
  const usedIds = new Set<string>();
  const usedPlates = new Set<string>();

  const unique = (used: Set<string>, make: () => string): string => {
    for (;;) {
      const v = make();
      if (!used.has(v)) {
        used.add(v);
        return v;
      }
    }
  };

  return {
    vehicleId: () => unique(usedIds, () => `${brand.idPrefix}-${brand.hubCode}-${digits(rng, 5)}`),
    plate: () =>
      unique(usedPlates, () => {
        const letters = Array.from({ length: 3 }, () => rng.pick(LETTERS)).join('');
        return `${String(rng.int(1, 9))}${letters}${digits(rng, 3)}`;
      }),
    agreementNo: (year) => `${brand.agreementPrefix}-${String(year % 100).padStart(2, '0')}-${digits(rng, 7)}`,
    odometerMi: () => rng.int(3_000, 45_000),
    tier: () => rng.pick(brand.tiers),
    chargeRateKw: () => rng.pick(CHARGER_RATINGS),
  };
}
