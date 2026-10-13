import { describe, expect, it } from 'vitest';
import { TRACKER_STAGES, VEHICLE_STATES } from '../../../src/sim/lifecycle';
import {
  classLabel,
  formatClock,
  formatDuration,
  formatMiles,
  formatPercent,
  kindLabel,
  stageLabel,
  stateLabel,
  unitLabel,
} from '../../../src/ui/format';

describe('number formats', () => {
  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(59.4)).toBe('59 s');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(725)).toBe('12 min');
    expect(formatDuration(3_900)).toBe('1 h 05 min');
  });

  it('formats percentages, miles and the clock', () => {
    expect(formatPercent(81.6)).toBe('82%');
    expect(formatPercent(null)).toBe('—');
    expect(formatMiles(12_345.4)).toBe('12,345 mi');
    expect(formatMiles(null)).toBe('—');
    expect(formatClock(8 + 5 / 60)).toBe('08:05');
    expect(formatClock(23.999)).toBe('23:59');
  });
});

describe('labels', () => {
  it('names every lifecycle state, distinctly', () => {
    const labels = VEHICLE_STATES.map(stateLabel);
    for (const l of labels) expect(l.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
    expect(stateLabel('energising')).toBe('Charging / refuelling');
    expect(stateLabel('staged')).toBe('Ready for rent');
    expect(stateLabel('onRent')).toBe('On rent');
  });

  it('uses the requirement wording for tracker stages', () => {
    expect(TRACKER_STAGES.map(stageLabel)).toEqual(['Returned', 'Inspected', 'Washed & detailed', 'Refuelled / charged', 'Staged', 'Dispatched']);
  });

  it('uses brand-neutral model and agent names (N-7)', () => {
    expect(classLabel('ev')).toBe('Compact EV crossover');
    expect(classLabel('suv')).toBe('Full-size SUV');
    expect(classLabel('sedan')).toBe('Mid-size sedan');
    expect(classLabel('economy')).toBe('Economy hatchback');
    expect(classLabel('luxury')).toBe('Premium saloon');
    expect(classLabel('minivan')).toBe('7-seat minivan');
    expect(classLabel('pickup')).toBe('Crew-cab pickup');
    expect(kindLabel('tow')).toBe('Tow truck');
    expect(kindLabel('shuttle')).toBe('Shuttle bus');
    expect(kindLabel('cart')).toBe('Technician cart');
    expect(kindLabel('van')).toBe('Service van');
    expect(kindLabel('pedestrian')).toBe('Customer');
    expect(kindLabel('fleet')).toBe('Fleet vehicle');
  });

  it('labels units', () => {
    expect(unitLabel('lane2')).toBe('Return lane 2');
    expect(unitLabel('wash2')).toBe('Wash bay 2');
    expect(unitLabel('bay1')).toBe('Service bay 1');
    expect(unitLabel('charger3')).toBe('EV charger 3');
    expect(unitLabel('pump4')).toBe('Fuel pump 4');
    expect(unitLabel('gate1')).toBe('Exit gate 1');
    // M9 (FE-3): stalls are named by row (was 'Ready slot EV-04', 'Ready slot SEDAN-12').
    expect(unitLabel('ev-04')).toBe('EV row · stall 4');
    expect(unitLabel('cars-12')).toBe('Cars row · stall 12');
    expect(unitLabel('large-01')).toBe('SUVs & vans row · stall 1');
    expect(unitLabel('towbay1')).toBe('Tow bay');
    expect(unitLabel('mystery')).toBe('mystery');
  });
});
