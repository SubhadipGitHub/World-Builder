import { describe, expect, it } from 'vitest';
import { brand } from '../../../src/config/brand';
import { createDataGen } from '../../../src/sim/datagen';
import { createRng } from '../../../src/sim/rng';

describe('createDataGen (D-7)', () => {
  it('formats vehicle IDs with the brand prefix and hub code, unique across the fleet', () => {
    const gen = createDataGen(createRng(1), brand);
    const ids = Array.from({ length: 500 }, () => gen.vehicleId());
    for (const id of ids) expect(id).toMatch(/^GL-PGW-\d{5}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('formats plates like 8ABC123, unique', () => {
    const gen = createDataGen(createRng(2), brand);
    const plates = Array.from({ length: 500 }, () => gen.plate());
    for (const p of plates) expect(p).toMatch(/^\d[A-Z]{3}\d{3}$/);
    expect(new Set(plates).size).toBe(plates.length);
  });

  it('formats agreement numbers with the two-digit year', () => {
    const gen = createDataGen(createRng(3), brand);
    expect(gen.agreementNo(2026)).toMatch(/^RA-26-\d{7}$/);
  });

  it('keeps odometer, tier and charger rate in range', () => {
    const gen = createDataGen(createRng(4), brand);
    const tiers = new Set<string>();
    for (let i = 0; i < 1_000; i++) {
      const odo = gen.odometerMi();
      expect(Number.isInteger(odo)).toBe(true);
      expect(odo).toBeGreaterThanOrEqual(3_000);
      expect(odo).toBeLessThanOrEqual(45_000);
      const kw = gen.chargeRateKw();
      expect(Number.isInteger(kw)).toBe(true);
      expect(kw).toBeGreaterThanOrEqual(50);
      expect(kw).toBeLessThanOrEqual(250);
      tiers.add(gen.tier());
    }
    expect([...tiers].sort()).toEqual(['Gold', 'Platinum']);
  });

  it('is deterministic per seed', () => {
    const a = createDataGen(createRng(5), brand);
    const b = createDataGen(createRng(5), brand);
    expect([a.vehicleId(), a.plate(), a.agreementNo(2026)]).toEqual([b.vehicleId(), b.plate(), b.agreementNo(2026)]);
  });
});
