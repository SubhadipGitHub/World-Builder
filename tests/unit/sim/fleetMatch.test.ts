import { describe, expect, it } from 'vitest';
import { matchCar } from '../../../src/sim/fleetMatch';

// M9 (FE-3; architecture F4): the booked class, else the same row, else any ready car, in FIFO order.

const ready = [
  { id: 'A', cls: 'ev' as const },
  { id: 'B', cls: 'suv' as const },
  { id: 'C', cls: 'sedan' as const },
  { id: 'D', cls: 'pickup' as const },
  { id: 'E', cls: 'sedan' as const },
];

describe('matchCar', () => {
  it('prefers the booked class, first in line', () => {
    expect(matchCar('sedan', ready)).toBe('C');
    expect(matchCar('pickup', ready)).toBe('D');
  });

  it('falls back to the same lot row', () => {
    // No luxury car: the first car in the Cars row (a sedan).
    expect(matchCar('luxury', ready)).toBe('C');
    // No minivan: the first in SUVs & vans.
    expect(matchCar('minivan', ready)).toBe('B');
  });

  it('falls back to any ready car', () => {
    expect(matchCar('economy', [{ id: 'X', cls: 'ev' }])).toBe('X');
  });

  it('returns null when nothing is ready', () => {
    expect(matchCar('ev', [])).toBeNull();
  });
});
