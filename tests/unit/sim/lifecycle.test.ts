import { describe, expect, it } from 'vitest';
import {
  isParkedState,
  milestoneFor,
  nextState,
  TRACKER_STAGES,
  VEHICLE_STATES,
  type LifecycleFlags,
  type TrackerStage,
  type VehicleState,
} from '../../../src/sim/lifecycle';

const clean: LifecycleFlags = { maintenance: false, severe: false, serviced: false, washed: false };

/** Walks one full cycle from onRent back to onRent, updating flags the way the sim will. */
function walk(start: LifecycleFlags): { states: VehicleState[]; milestones: TrackerStage[] } {
  let flags = { ...start };
  let state: VehicleState = 'onRent';
  const states: VehicleState[] = [state];
  const milestones: TrackerStage[] = [];
  for (let i = 0; i < 40; i++) {
    const next = nextState(state, flags);
    const m = milestoneFor(state, next);
    if (m) milestones.push(m);
    if (state === 'washing') flags = { ...flags, washed: true };
    if (state === 'inService') flags = { ...flags, serviced: true };
    state = next;
    states.push(state);
    if (state === 'onRent') break;
  }
  return { states, milestones };
}

describe('lifecycle state machine (L-1)', () => {
  it('follows the normal path', () => {
    expect(walk(clean).states).toEqual([
      'onRent', 'arriving', 'inspecting', 'washQueue', 'washing', 'energyQueue', 'energising', 'toLot', 'staged', 'departing', 'onRent',
    ]);
  });

  it('visits a service bay after the wash and before charging when an alert is raised', () => {
    expect(walk({ ...clean, maintenance: true }).states).toEqual([
      'onRent', 'arriving', 'inspecting', 'washQueue', 'washing', 'serviceQueue', 'inService', 'energyQueue', 'energising', 'toLot', 'staged', 'departing', 'onRent',
    ]);
  });

  it('tows a severe case straight to service, then washes and charges it', () => {
    expect(walk({ ...clean, maintenance: true, severe: true }).states).toEqual([
      'onRent', 'arriving', 'inspecting', 'awaitingTow', 'beingTowed', 'inService', 'washQueue', 'washing', 'energyQueue', 'energising', 'toLot', 'staged', 'departing', 'onRent',
    ]);
  });

  it('emits all 6 tracker milestones once each, in order, on every path', () => {
    for (const flags of [clean, { ...clean, maintenance: true }, { ...clean, maintenance: true, severe: true }]) {
      expect(walk(flags).milestones).toEqual([...TRACKER_STAGES]);
    }
  });

  it('has a successor for every state and flag combination (no dead ends)', () => {
    for (const state of VEHICLE_STATES) {
      for (const maintenance of [false, true]) {
        for (const severe of [false, true]) {
          for (const serviced of [false, true]) {
            for (const washed of [false, true]) {
              const next = nextState(state, { maintenance, severe, serviced, washed });
              expect(VEHICLE_STATES).toContain(next);
              expect(next).not.toBe(state);
            }
          }
        }
      }
    }
  });

  it('returns null for transitions that are not milestones', () => {
    expect(milestoneFor('onRent', 'arriving')).toBeNull();
    expect(milestoneFor('washQueue', 'washing')).toBeNull();
    expect(milestoneFor('energyQueue', 'energising')).toBeNull();
  });

  it('marks working and parked states as expected-stationary', () => {
    for (const s of ['inspecting', 'awaitingTow', 'washing', 'inService', 'energising', 'staged'] as const) {
      expect(isParkedState(s)).toBe(true);
    }
    for (const s of ['arriving', 'washQueue', 'toLot', 'departing', 'beingTowed'] as const) {
      expect(isParkedState(s)).toBe(false);
    }
  });
});
