import { describe, expect, it } from 'vitest';
import { atRisk, billedDays, bookingValue, createRevenueLedger } from '../../../src/sim/revenue';

// M9 (FE-5, D50; architecture F6–F8).

const H = 3600;
const DAY = 24 * H;

describe('billedDays', () => {
  it('bills at least one day and rounds part-days up', () => {
    expect(billedDays(0)).toBe(1);
    expect(billedDays(30 * 60)).toBe(1);
    expect(billedDays(DAY)).toBe(1);
    expect(billedDays(DAY + 1)).toBe(2);
    expect(billedDays(3 * DAY - 1)).toBe(3);
  });
});

describe('bookingValue', () => {
  it('is the booked class rate × billed days', () => {
    expect(bookingValue('pickup', 4 * H)).toBe(84);
    expect(bookingValue('luxury', DAY + H)).toBe(238);
  });

  it('charges the booked class, so an upgrade is free', () => {
    // The customer booked an economy car; the car they drive off in doesn't matter.
    expect(bookingValue('economy', 5 * H)).toBe(42);
  });
});

describe('createRevenueLedger', () => {
  it('accumulates today and the running total', () => {
    const l = createRevenueLedger();
    l.book(55, 9 * H);
    l.book(84, 10 * H);
    expect(l.view(11 * H)).toEqual({ today: 139, total: 139, rentalsToday: 2 });
  });

  it('resets "today" at hub midnight but keeps the total', () => {
    const l = createRevenueLedger();
    l.book(100, 23 * H);
    l.book(50, DAY + 1 * H);
    expect(l.view(DAY + 2 * H)).toEqual({ today: 50, total: 150, rentalsToday: 1 });
  });

  it('reads $0 today after midnight even with no booking since (lazy reset)', () => {
    const l = createRevenueLedger();
    l.book(100, 22 * H);
    expect(l.view(23 * H).today).toBe(100);
    expect(l.view(DAY + 30).today).toBe(0);
    expect(l.view(DAY + 30).rentalsToday).toBe(0);
    expect(l.view(DAY + 30).total).toBe(100);
  });
});

describe('atRisk (D50)', () => {
  it('sums booked rates of customers waiting longer than the threshold', () => {
    const now = 10_000;
    const customers = [
      { cls: 'sedan' as const, arrivedAt: now - 1_201 },
      { cls: 'luxury' as const, arrivedAt: now - 5_000 },
      { cls: 'ev' as const, arrivedAt: now - 1_199 },
      { cls: 'pickup' as const, arrivedAt: now - 10 },
    ];
    expect(atRisk(customers, now, 1_200)).toEqual({ amount: 55 + 119, count: 2 });
  });

  it('is zero with an empty counter', () => {
    expect(atRisk([], 500, 1_200)).toEqual({ amount: 0, count: 0 });
  });
});
