import { describe, expect, it } from 'vitest';
import { interpolateAgents, lerpAngle, SNAP_DISTANCE_M } from '../../../src/render/interp';
import type { AgentView } from '../../../src/sim/world';

const agent = (id: string, x: number, z: number, heading = 0): AgentView => ({
  id,
  kind: 'fleet',
  cls: 'sedan',
  x,
  z,
  heading,
  speed: 1,
  length: 4.8,
  width: 1.85,
  parked: false,
  state: 'toLot',
  stage: 'energised',
  plate: '8ABC123',
  agreementNo: null,
  fuelPct: 90,
  socPct: null,
  odometerMi: 12_000,
  ratePerDay: 55,
  milesToService: 3_000,
  task: '',
  etaSimSec: null,
  parentId: null,
});

describe('lerpAngle', () => {
  it('interpolates the short way round', () => {
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5);
    const mid = lerpAngle(3.0, -3.0, 0.5);
    expect(Math.cos(mid)).toBeCloseTo(-1, 2);
  });
});

describe('interpolateAgents', () => {
  it('blends agents present in both snapshots', () => {
    const out = interpolateAgents([agent('a', 0, 0, 0)], [agent('a', 2, 4, 1)], 0.25);
    const p = out.get('a')!;
    expect(p.x).toBeCloseTo(0.5);
    expect(p.z).toBeCloseTo(1);
    expect(p.heading).toBeCloseTo(0.25);
  });

  it('shows new agents at their current pose and drops departed ones', () => {
    const out = interpolateAgents([agent('gone', 0, 0)], [agent('new', 5, 5)], 0.5);
    expect(out.has('gone')).toBe(false);
    expect(out.get('new')).toEqual({ x: 5, z: 5, heading: 0 });
  });

  it('snaps teleports instead of sliding across the map', () => {
    const out = interpolateAgents([agent('a', 0, 0)], [agent('a', SNAP_DISTANCE_M + 1, 0)], 0.5);
    expect(out.get('a')!.x).toBe(SNAP_DISTANCE_M + 1);
  });
});
