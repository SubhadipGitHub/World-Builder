import { describe, expect, it } from 'vitest';
import { dimensions, facility, maxFleetLength } from '../../../src/config/facility';
import { hub, hubGraph, type StationId } from '../../../src/layout/hub';
import type { LaneGraph } from '../../../src/sim/graph/laneGraph';

const graph: LaneGraph = hubGraph();
const units = (id: StationId) => hub.stations[id].units;
const queue = (id: StationId): string => {
  const q = hub.stations[id].queueEdge;
  if (q === null) throw new Error(`${id} has no queue edge`);
  return q;
};
const reachable = (from: string, to: string, kind: 'fleet' | 'tow' = 'fleet') => graph.route(from, to, kind) !== null;

function chained(edges: readonly string[]): boolean {
  return edges.every((id, i) => i === 0 || graph.edge(edges[i - 1]!).to === graph.edge(id).from);
}

/** A vehicle of `length` parked with its front at the end of `edgeId` must not sit in a zone. */
function parkedClearOfZones(edgeId: string, length: number): boolean {
  const len = graph.edge(edgeId).length;
  return graph.zonesOn(edgeId).every(({ interval }) => interval.sExit <= len - length - 0.1);
}


describe('hub layout: capacities (W-5)', () => {
  it('has the configured number of units per station', () => {
    expect(units('returnLane')).toHaveLength(facility.returnLanes);
    expect(units('wash')).toHaveLength(facility.washBays);
    expect(units('service')).toHaveLength(facility.serviceBays);
    expect(units('charger')).toHaveLength(facility.evChargers);
    expect(units('pump')).toHaveLength(facility.fuelPumps);
    expect(units('gate')).toHaveLength(facility.exitGates);
    expect(units('towBay')).toHaveLength(1);
  });

  // M9 (FE-3): rows are Cars, SUVs & vans and EV (were Sedan, SUV, EV); maxFleetLength now covers all 7 classes.
  it('splits Ready-lot slots into rows', () => {
    const slots = units('slot');
    for (const row of ['cars', 'large', 'ev'] as const) {
      expect(slots.filter((u) => u.tag === row)).toHaveLength(facility.readySlots[row]);
    }
  });

  it('gives every service bay an edge beyond it where a tow truck stops', () => {
    for (const u of units('service')) {
      expect(u.beyondEdge).toBeDefined();
      expect(graph.edge(u.beyondEdge!).from).toBe(graph.edge(u.parkEdge).to);
    }
  });
});

describe('hub layout: fleet routes (L-1)', () => {
  it('reaches every return lane from the entry', () => {
    expect(queue('returnLane')).toBe(hub.entryEdge);
    for (const u of units('returnLane')) expect(reachable(hub.entryEdge, u.parkEdge)).toBe(true);
  });

  it('links every station to the next ones in the lifecycle', () => {
    for (const u of units('returnLane')) {
      expect(reachable(u.parkEdge, queue('wash'))).toBe(true);
      expect(reachable(u.parkEdge, units('towBay')[0]!.parkEdge)).toBe(true);
    }
    for (const u of units('wash')) {
      for (const next of ['service', 'charger', 'pump'] as const) expect(reachable(u.parkEdge, queue(next))).toBe(true);
    }
    for (const u of units('service')) {
      expect(reachable(u.parkEdge, queue('charger'))).toBe(true);
      expect(reachable(u.parkEdge, queue('pump'))).toBe(true);
    }
    for (const u of [...units('charger'), ...units('pump')]) expect(reachable(u.parkEdge, queue('slot'))).toBe(true);
    for (const u of units('slot')) expect(reachable(u.parkEdge, queue('gate'))).toBe(true);
    for (const u of units('gate')) expect(reachable(u.parkEdge, hub.exitEdge)).toBe(true);
  });

  it('reaches every unit from its station queue', () => {
    for (const id of ['wash', 'service', 'charger', 'pump', 'slot', 'gate'] as const) {
      for (const u of units(id)) expect(reachable(queue(id), u.parkEdge), `${id} ${u.id}`).toBe(true);
    }
  });

  it('keeps fleet routes off tow-only, shuttle, service and pedestrian edges', () => {
    const route = graph.route(hub.entryEdge, hub.exitEdge, 'fleet');
    expect(route).not.toBeNull();
    for (const id of route!) {
      const kinds = graph.edge(id).kinds;
      expect(kinds === null || kinds.includes('fleet')).toBe(true);
    }
  });
});

describe('hub layout: tow, shuttle, service loop and walkway', () => {
  it('connects the tow depot, tow stop, service queue and service bays', () => {
    expect(reachable(hub.tow.depotEdge, hub.tow.stopEdge, 'tow')).toBe(true);
    expect(reachable(hub.tow.stopEdge, queue('service'), 'tow')).toBe(true);
    for (const u of units('service')) {
      const route = graph.route(queue('service'), u.beyondEdge!, 'tow');
      expect(route).toContain(u.parkEdge);
      expect(reachable(u.beyondEdge!, hub.tow.depotEdge, 'tow')).toBe(true);
    }
  });

  it('has closed shuttle and service loops', () => {
    for (const loop of [hub.shuttle.loop, hub.serviceLoop]) {
      expect(chained(loop)).toBe(true);
      expect(graph.edge(loop[loop.length - 1]!).to).toBe(graph.edge(loop[0]!).from);
    }
    expect(hub.shuttle.loop).toContain(hub.shuttle.stopEdge);
  });

  it('has chained walkway routes from the terminal door to each row', () => {
    for (const row of ['cars', 'large', 'ev'] as const) {
      const route = hub.walkway.routes[row];
      expect(route[0]).toBe(hub.walkway.doorEdge);
      expect(chained(route)).toBe(true);
    }
  });

  it('has walkway crossings over lot aisles (L-4 pedestrian crossings)', () => {
    const crossings = graph.zones.filter(
      (z) => z.intervals.some((i) => graph.edge(i.edgeId).kinds?.includes('pedestrian')) && z.intervals.some((i) => graph.edge(i.edgeId).kinds === null),
    );
    expect(crossings.length).toBeGreaterThanOrEqual(2);
  });

  it('spawns only on edges with no inbound traffic', () => {
    for (const spawnEdge of [hub.entryEdge, hub.walkway.doorEdge]) {
      const from = graph.edge(spawnEdge).from;
      expect(graph.edges.filter((e) => e.to === from)).toEqual([]);
    }
  });
});

describe('hub layout: nothing parks inside a conflict zone (box rule feasibility)', () => {
  it('keeps unit parking spots clear of zones', () => {
    for (const id of ['returnLane', 'towBay', 'wash', 'service', 'charger', 'pump', 'slot', 'gate'] as const) {
      for (const u of units(id)) expect(parkedClearOfZones(u.parkEdge, maxFleetLength), `${id} ${u.id}`).toBe(true);
    }
  });

  it('keeps queue heads clear of zones', () => {
    for (const id of ['returnLane', 'wash', 'service', 'charger', 'pump', 'slot', 'gate'] as const) {
      expect(parkedClearOfZones(queue(id), hub.tow.carryLength), id).toBe(true);
    }
  });

  it('keeps tow, shuttle and pedestrian stopping points clear of zones', () => {
    expect(parkedClearOfZones(hub.tow.stopEdge, hub.tow.carryLength)).toBe(true);
    expect(parkedClearOfZones(hub.tow.depotEdge, dimensions.tow.length)).toBe(true);
    expect(parkedClearOfZones(hub.shuttle.stopEdge, dimensions.shuttle.length)).toBe(true);
    for (const route of Object.values(hub.walkway.routes)) {
      expect(parkedClearOfZones(route[route.length - 1]!, dimensions.pedestrian.length)).toBe(true);
    }
  });

  it('exposes the tow carry geometry consistently', () => {
    expect(hub.tow.carryLength).toBeCloseTo(dimensions.tow.length + hub.tow.gap + maxFleetLength);
    for (const u of units('service')) expect(graph.edge(u.beyondEdge!).length).toBeCloseTo(dimensions.tow.length + hub.tow.gap);
  });
});

describe('hub layout: scene metadata', () => {
  it('defines the five hub camera areas (I-5), then the Airport area (M6, L-2)', () => {
    expect(hub.areas.map((a) => a.id)).toEqual(['overview', 'return', 'wash', 'energy', 'lot', 'airport']);
  });

  it('defines footprints for every building and zone (W-2)', () => {
    const ids = hub.buildings.map((b) => b.id);
    for (const id of ['terminal', 'canopy', 'wash', 'service', 'evHub', 'fuel', 'lot', 'gates']) expect(ids).toContain(id);
  });
});
