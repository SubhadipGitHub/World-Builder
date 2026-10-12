import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { idm, priority } from '../../../../src/config/rates';
import { dimensions } from '../../../../src/config/facility';
import { buildLaneGraph, type LaneGraph, type LaneGraphSpec } from '../../../../src/sim/graph/laneGraph';
import { findOverlaps } from '../../../../src/sim/invariants';
import { createTrafficEngine, type MoverSpec, type MoverView, type TrafficEngine } from '../../../../src/sim/traffic/engine';

const DT = 0.05;

const straight: LaneGraphSpec = {
  nodes: [
    { id: 'a', x: 0, z: 0 },
    { id: 'b', x: 100, z: 0 },
    { id: 'c', x: 160, z: 0 },
  ],
  edges: [
    { id: 'e1', from: 'a', to: 'b', speedLimit: 8 },
    { id: 'e2', from: 'b', to: 'c', speedLimit: 8 },
  ],
};

const crossing: LaneGraphSpec = {
  nodes: [
    { id: 'w', x: -60, z: 0 },
    { id: 'e', x: 60, z: 0 },
    { id: 'n', x: 0, z: -60 },
    { id: 's', x: 0, z: 60 },
  ],
  edges: [
    { id: 'we', from: 'w', to: 'e', speedLimit: 8 },
    { id: 'ns', from: 'n', to: 's', speedLimit: 8 },
  ],
};

const merge: LaneGraphSpec = {
  nodes: [
    { id: 'l', x: -50, z: -20 },
    { id: 'r', x: -50, z: 20 },
    { id: 'm', x: 0, z: 0 },
    { id: 'o', x: 80, z: 0 },
  ],
  edges: [
    { id: 'lm', from: 'l', to: 'm', speedLimit: 8 },
    { id: 'rm', from: 'r', to: 'm', speedLimit: 8 },
    { id: 'mo', from: 'm', to: 'o', speedLimit: 8 },
  ],
};

type Kind = 'fleet' | 'shuttle' | 'cart';

function spec(id: string, route: readonly string[], kind: Kind = 'fleet'): MoverSpec {
  const dims = kind === 'fleet' ? dimensions.suv : dimensions[kind];
  const params = kind === 'fleet' ? idm.lot : idm[kind];
  return { id, kind, route, length: dims.length, width: dims.width, priority: priority[kind], idm: params };
}

const footprintsOf = (movers: readonly MoverView[]) =>
  movers.map((m) => ({ id: m.id, x: m.x, z: m.z, heading: m.heading, length: m.length, width: m.width }));

function run(engine: TrafficEngine, seconds: number, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    engine.step(DT);
    each?.();
  }
}

/** A stopped mover's body must not overlap a conflict zone on its current edge (box rule). */
function stoppedInsideZone(graph: LaneGraph, m: MoverView): boolean {
  if (m.speed > 0.01) return false;
  return graph.zonesOn(m.edgeId).some(({ interval }) => m.s > interval.sEnter + 1e-6 && m.s - m.length < interval.sExit - 1e-6);
}

describe('createTrafficEngine: basics', () => {
  it('spawns at s = length on the first edge and reports the body centre', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    expect(engine.spawn(spec('car', ['e1']))).toBe(true);
    const m = engine.mover('car')!;
    expect(m.edgeId).toBe('e1');
    expect(m.s).toBeCloseTo(dimensions.suv.length);
    expect(m.x).toBeCloseTo(dimensions.suv.length / 2);
    expect(m.z).toBeCloseTo(0);
    expect(m.heading).toBeCloseTo(0);
  });

  it('rejects duplicate ids and spawning into an occupied entry', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    expect(engine.spawn(spec('a', ['e1']))).toBe(true);
    expect(engine.spawn(spec('a', ['e1']))).toBe(false);
    expect(engine.spawn(spec('b', ['e1']))).toBe(false);
    run(engine, 5);
    expect(engine.spawn(spec('b', ['e1']))).toBe(true);
  });

  it('drives a free route to its end, then parks there as finished', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    engine.spawn(spec('car', ['e1', 'e2']));
    run(engine, 60);
    const m = engine.mover('car')!;
    expect(m.finished).toBe(true);
    expect(m.edgeId).toBe('e2');
    expect(m.s).toBeCloseTo(60, 1);
    expect(m.speed).toBe(0);
  });

  it('respects speedFactor (weather) as a cap on desired speed', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    engine.spawn(spec('car', ['e1', 'e2']));
    let maxSpeed = 0;
    for (let i = 0; i < 300; i++) {
      engine.step(DT, 0.8);
      maxSpeed = Math.max(maxSpeed, engine.mover('car')!.speed);
    }
    expect(maxSpeed).toBeLessThanOrEqual(idm.lot.v0 * 0.8 + 1e-9);
    expect(maxSpeed).toBeGreaterThan(idm.lot.v0 * 0.7);
  });

  it('counts ticks', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    run(engine, 1);
    expect(engine.tick).toBe(20);
  });
});

describe('createTrafficEngine: queueing and stop lines', () => {
  it('queues several movers behind a stop line with gaps of at least s0, then releases them', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    engine.addStopLine('gate', 'e1', 50);
    const ids = ['c1', 'c2', 'c3'];
    for (const id of ids) {
      while (!engine.spawn(spec(id, ['e1', 'e2']))) engine.step(DT);
    }
    run(engine, 60, () => expect(findOverlaps(footprintsOf(engine.movers()))).toEqual([]));
    const ms = ids.map((id) => engine.mover(id)!);
    expect(ms[0]!.s).toBeLessThanOrEqual(50 + 1e-6);
    for (const m of ms) expect(m.speed).toBeCloseTo(0, 2);
    for (let i = 1; i < ms.length; i++) {
      const gap = ms[i - 1]!.s - ms[i - 1]!.length - ms[i]!.s;
      expect(gap).toBeGreaterThanOrEqual(idm.lot.s0 - 1e-6);
    }
    engine.removeStopLine('gate');
    run(engine, 90);
    for (const id of ids) expect(engine.mover(id)!.edgeId).toBe('e2');
  });

  it('sees a leader whose rear is still on a shared edge after it turned off the follower’s route', () => {
    // Leader goes a→b→c; follower's route ends at b. The leader's rear lingers on e1 near b.
    const g = buildLaneGraph({
      nodes: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 30, z: 0 },
        { id: 'c', x: 30, z: 40 },
      ],
      edges: [
        { id: 'e1', from: 'a', to: 'b', speedLimit: 8 },
        { id: 'e2', from: 'b', to: 'c', speedLimit: 8 },
      ],
    });
    const engine = createTrafficEngine(g);
    engine.spawn(spec('lead', ['e1', 'e2']), 24);
    engine.addStopLine('hold', 'e2', 2);
    engine.spawn(spec('follow', ['e1']));
    run(engine, 30, () => expect(findOverlaps(footprintsOf(engine.movers()))).toEqual([]));
    const lead = engine.mover('lead')!;
    const follow = engine.mover('follow')!;
    expect(lead.edgeId).toBe('e2');
    expect(follow.s).toBeLessThanOrEqual(30 - (lead.length - lead.s) - idm.lot.s0 + 1e-6);
  });

  it('continues after setRoute extends a finished route', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    engine.spawn(spec('car', ['e1']));
    run(engine, 40);
    expect(engine.mover('car')!.finished).toBe(true);
    engine.setRoute('car', ['e1', 'e2']);
    run(engine, 30);
    expect(engine.mover('car')!.edgeId).toBe('e2');
    expect(engine.mover('car')!.finished).toBe(true);
  });

  it('remove() frees the space and any zone the mover holds', () => {
    const g = buildLaneGraph(crossing);
    const engine = createTrafficEngine(g);
    engine.spawn(spec('a', ['we']));
    const zoneId = g.zones[0]!.id;
    for (let i = 0; i < 600 && engine.zones.holder(zoneId) !== 'a'; i++) engine.step(DT);
    expect(engine.zones.holder(zoneId)).toBe('a');
    engine.remove('a');
    expect(engine.mover('a')).toBeNull();
    expect(engine.zones.holder(zoneId)).toBeNull();
  });
});

describe('createTrafficEngine: placement and towing support', () => {
  it('spawn(spec, s) places the front at s and checks clearance around that spot', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    expect(engine.spawn(spec('a', ['e1']), 50)).toBe(true);
    const a = engine.mover('a')!;
    expect(a.s).toBeCloseTo(50);
    expect(a.x).toBeCloseTo(50 - dimensions.suv.length / 2);
    expect(engine.spawn(spec('b', ['e1']), 52)).toBe(false);
    expect(engine.spawn(spec('b', ['e1']), 50 - dimensions.suv.length - 0.5)).toBe(false);
    expect(engine.spawn(spec('b', ['e1']), 30)).toBe(true);
  });

  it('spawn(spec, s) at the end of a single-edge route parks immediately', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    engine.spawn(spec('a', ['e2']), 60);
    expect(engine.mover('a')!.finished).toBe(true);
  });

  it('setLength changes the body that followers and spawns respect', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    engine.spawn(spec('a', ['e1']), 40);
    engine.setLength('a', 12);
    expect(engine.mover('a')!.length).toBe(12);
    expect(engine.spawn(spec('b', ['e1']), 30)).toBe(false);
    expect(engine.spawn(spec('b', ['e1']), 20)).toBe(true);
  });

  it('occupies() reports every edge the body still covers', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    engine.spawn(spec('a', ['e1', 'e2']), 98);
    expect(engine.occupies('a', 'e1')).toBe(true);
    expect(engine.occupies('a', 'e2')).toBe(false);
    run(engine, 20);
    expect(engine.occupies('a', 'e1')).toBe(false);
    expect(engine.occupies('a', 'e2')).toBe(true);
    expect(engine.occupies('ghost', 'e1')).toBe(false);
  });

  it('pointBehind() follows the route backwards from the front', () => {
    const engine = createTrafficEngine(buildLaneGraph(straight));
    engine.spawn(spec('a', ['e1']), 40);
    const p = engine.pointBehind('a', 10);
    expect(p.x).toBeCloseTo(30);
    expect(p.z).toBeCloseTo(0);
    expect(() => engine.pointBehind('ghost', 1)).toThrow();
  });
});

describe('createTrafficEngine: no overlap, no gridlock (L-4 property tests)', () => {
  const scenarios = [
    { name: 'crossing', spec: crossing, routes: [['we'], ['ns']] },
    { name: 'merge', spec: merge, routes: [['lm', 'mo'], ['rm', 'mo']] },
  ] as const;

  const arrivals = fc.array(
    fc.record({
      lane: fc.constantFrom(0, 1),
      atStep: fc.integer({ min: 0, max: 400 }),
      kind: fc.constantFrom<Kind>('fleet', 'fleet', 'fleet', 'shuttle', 'cart'),
    }),
    { minLength: 1, maxLength: 24 },
  );

  for (const sc of scenarios) {
    it(`${sc.name}: random arrivals never overlap, never stop inside a zone, and all get through`, () => {
      fc.assert(
        fc.property(arrivals, (list) => {
          const graph = buildLaneGraph(sc.spec);
          const engine = createTrafficEngine(graph);
          const pending = [...list].map((a, i) => ({ ...a, id: `m${String(i)}` })).sort((x, y) => x.atStep - y.atStep);
          let done = 0;
          for (let stepNo = 0; stepNo < 8_000 && done < list.length; stepNo++) {
            for (const lane of [0, 1] as const) {
              const next = pending.find((p) => p.lane === lane && p.atStep <= stepNo);
              if (next && engine.spawn(spec(next.id, sc.routes[lane], next.kind))) {
                pending.splice(pending.indexOf(next), 1);
              }
            }
            engine.step(DT);
            const movers = [...engine.movers()];
            expect(findOverlaps(footprintsOf(movers))).toEqual([]);
            for (const m of movers) {
              expect(stoppedInsideZone(graph, m)).toBe(false);
              if (m.finished) {
                engine.remove(m.id);
                done++;
              }
            }
          }
          expect(done).toBe(list.length);
        }),
        { numRuns: 40 },
      );
    });
  }

  it('is deterministic for the same inputs', () => {
    const play = () => {
      const engine = createTrafficEngine(buildLaneGraph(merge));
      const out: string[] = [];
      for (let i = 0; i < 1_500; i++) {
        if (i % 40 === 0) engine.spawn(spec(`l${String(i)}`, ['lm', 'mo']));
        if (i % 55 === 0) engine.spawn(spec(`r${String(i)}`, ['rm', 'mo'], 'shuttle'));
        engine.step(DT);
      }
      for (const m of engine.movers()) out.push(`${m.id}:${m.edgeId}:${m.s.toFixed(6)}`);
      return out.join('|');
    };
    expect(play()).toBe(play());
  });
});
