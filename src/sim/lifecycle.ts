/** Fleet-vehicle states (requirements L-1). */
export type VehicleState =
  | 'onRent'
  | 'arriving'
  | 'inspecting'
  | 'awaitingTow'
  | 'beingTowed'
  | 'washQueue'
  | 'washing'
  | 'serviceQueue'
  | 'inService'
  | 'energyQueue'
  | 'energising'
  | 'toLot'
  | 'staged'
  | 'departing';

export const VEHICLE_STATES: readonly VehicleState[] = [
  'onRent',
  'arriving',
  'inspecting',
  'awaitingTow',
  'beingTowed',
  'washQueue',
  'washing',
  'serviceQueue',
  'inService',
  'energyQueue',
  'energising',
  'toLot',
  'staged',
  'departing',
];

/** The 6 process-tracker milestones (requirements D-5), in order. */
export type TrackerStage = 'returned' | 'inspected' | 'washed' | 'energised' | 'staged' | 'dispatched';

export const TRACKER_STAGES: readonly TrackerStage[] = ['returned', 'inspected', 'washed', 'energised', 'staged', 'dispatched'];

export interface LifecycleFlags {
  /** Inspection raised a maintenance alert. */
  readonly maintenance: boolean;
  /** The alert is severe: the tow truck takes the car from the lane to a service bay. */
  readonly severe: boolean;
  readonly serviced: boolean;
  readonly washed: boolean;
}

/**
 * The state that follows `state` once its work completes.
 * Normal:  onRent → arriving → inspecting → washQueue → washing → energyQueue → energising → toLot → staged → departing → onRent
 * Alert:   washing → serviceQueue → inService → energyQueue
 * Severe:  inspecting → awaitingTow → beingTowed → inService → washQueue → washing → energyQueue
 */
export function nextState(state: VehicleState, flags: LifecycleFlags): VehicleState {
  switch (state) {
    case 'onRent':
      return 'arriving';
    case 'arriving':
      return 'inspecting';
    case 'inspecting':
      return flags.severe ? 'awaitingTow' : 'washQueue';
    case 'awaitingTow':
      return 'beingTowed';
    case 'beingTowed':
      return 'inService';
    case 'washQueue':
      return 'washing';
    case 'washing':
      return flags.maintenance && !flags.serviced ? 'serviceQueue' : 'energyQueue';
    case 'serviceQueue':
      return 'inService';
    case 'inService':
      return flags.washed ? 'energyQueue' : 'washQueue';
    case 'energyQueue':
      return 'energising';
    case 'energising':
      return 'toLot';
    case 'toLot':
      return 'staged';
    case 'staged':
      return 'departing';
    case 'departing':
      return 'onRent';
  }
}

/**
 * The milestone reached on a transition, or null.
 * arriving→inspecting: returned · leaving inspecting: inspected · leaving washing: washed ·
 * energising→toLot: energised · toLot→staged: staged · departing→onRent: dispatched
 */
export function milestoneFor(from: VehicleState, to: VehicleState): TrackerStage | null {
  if (from === 'arriving' && to === 'inspecting') return 'returned';
  if (from === 'inspecting') return 'inspected';
  if (from === 'washing') return 'washed';
  if (from === 'energising' && to === 'toLot') return 'energised';
  if (from === 'toLot' && to === 'staged') return 'staged';
  if (from === 'departing' && to === 'onRent') return 'dispatched';
  return null;
}

const PARKED: ReadonlySet<VehicleState> = new Set(['inspecting', 'awaitingTow', 'washing', 'inService', 'energising', 'staged']);

/** States where a stationary vehicle is expected (not gridlock): working at a resource or parked. */
export function isParkedState(state: VehicleState): boolean {
  return PARKED.has(state);
}
