import type { Tier } from '../config/brand';
import type { TrackerStage } from './lifecycle';
import type { ScenarioEvent } from './scenario';
import type { VehicleClass } from './types';

/** Events the simulation emits for alerts, the tracker and the checkout log (D-5, D-6, D-8). */
export type SimEvent =
  | { readonly type: 'milestone'; readonly vehicleId: string; readonly stage: TrackerStage; readonly simTimeSec: number }
  | {
      readonly type: 'maintenanceFlagged';
      readonly vehicleId: string;
      /** The car's class (M9: the scheduled-service alert names the model, FE-9). */
      readonly cls: VehicleClass;
      readonly reason: 'tyres' | 'oil' | 'damage' | 'interval';
      readonly severe: boolean;
      readonly simTimeSec: number;
    }
  | { readonly type: 'towDispatched'; readonly vehicleId: string; readonly towId: string; readonly simTimeSec: number }
  | { readonly type: 'queueOverflow'; readonly resource: string; readonly length: number; readonly simTimeSec: number }
  | {
      readonly type: 'checkout';
      readonly vehicleId: string;
      readonly agreementNo: string;
      readonly tier: Tier;
      readonly gateId: string;
      /** The car's class, and the booked class's daily rate in US$ (FE-5). */
      readonly cls: VehicleClass;
      readonly ratePerDay: number;
      readonly simTimeSec: number;
    }
  | ScenarioEvent;
