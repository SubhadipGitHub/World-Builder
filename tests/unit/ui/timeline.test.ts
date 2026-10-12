import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../../src/sim/events';
import type { TrackerStage } from '../../../src/sim/lifecycle';
import { createTimeline } from '../../../src/ui/timeline';

const m = (vehicleId: string, stage: TrackerStage, simTimeSec: number): SimEvent => ({ type: 'milestone', vehicleId, stage, simTimeSec });

describe('createTimeline (D-5)', () => {
  it('records milestone times for a vehicle, in tracker order', () => {
    const t = createTimeline();
    t.ingest([m('v1', 'returned', 100), m('v1', 'inspected', 200), m('v2', 'returned', 150)]);
    expect(t.stepsFor('v1')).toEqual([
      { stage: 'returned', at: 100 },
      { stage: 'inspected', at: 200 },
      { stage: 'washed', at: null },
      { stage: 'energised', at: null },
      { stage: 'staged', at: null },
      { stage: 'dispatched', at: null },
    ]);
  });

  it('starts a new cycle on returned', () => {
    const t = createTimeline();
    t.ingest([m('v1', 'returned', 100), m('v1', 'inspected', 200), m('v1', 'washed', 300), m('v1', 'dispatched', 800)]);
    t.ingest([m('v1', 'returned', 900)]);
    expect(t.stepsFor('v1').map((s) => s.at)).toEqual([900, null, null, null, null, null]);
  });

  it('knows nothing about unseen vehicles and ignores other events', () => {
    const t = createTimeline();
    t.ingest([{ type: 'towDispatched', vehicleId: 'v9', towId: 'tow-1', simTimeSec: 5 }]);
    expect(t.stepsFor('v9').every((s) => s.at === null)).toBe(true);
    expect(t.stepsFor('v9')).toHaveLength(6);
  });
});
