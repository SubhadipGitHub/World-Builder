import type { Tier } from '../config/brand';
import type { TrackerStage } from './lifecycle';

/** Events the simulation emits for alerts, the tracker and the checkout log (D-5, D-6, D-8). */
export type SimEvent =
  | { readonly type: 'milestone'; readonly vehicleId: string; readonly stage: TrackerStage; readonly simTimeSec: number }
  | { readonly type: 'maintenanceFlagged'; readonly vehicleId: string; readonly reason: 'tyres' | 'oil' | 'damage'; readonly severe: boolean; readonly simTimeSec: number }
  | { readonly type: 'towDispatched'; readonly vehicleId: string; readonly towId: string; readonly simTimeSec: number }
  | { readonly type: 'queueOverflow'; readonly resource: string; readonly length: number; readonly simTimeSec: number }
  | { readonly type: 'checkout'; readonly vehicleId: string; readonly agreementNo: string; readonly tier: Tier; readonly gateId: string; readonly simTimeSec: number };
