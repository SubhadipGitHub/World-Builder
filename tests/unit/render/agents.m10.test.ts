import { InstancedMesh, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { FLEET_CLASS_ORDER } from '../../../src/config/fleet';
import { createAgentLayer, type AgentLayer } from '../../../src/render/agents';
import type { FleetModel } from '../../../src/render/assets/fleetModels';
import { vehicleAsset } from '../../../src/render/assets/vehicles';
import { darkPalette } from '../../../src/render/palette';
import type { VehicleClass } from '../../../src/sim/types';

// M10 geometry swap (requirements BM-12…BM-14, architecture M10-5, §23.8).

function model(cls: VehicleClass): FleetModel {
  const low = vehicleAsset(cls, darkPalette);
  const double = (g: BufferGeometry): BufferGeometry => mergeGeometries([g.clone(), g.clone()]);
  return { lods: { 0: { paint: double(low.paint), trim: double(low.trim), lamps: double(low.lamps) }, 1: low } };
}

const meshes = (layer: AgentLayer): InstancedMesh[] => layer.group.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
const meshesWith = (layer: AgentLayer, g: BufferGeometry): InstancedMesh[] => meshes(layer).filter((m) => m.geometry === g);

describe('AgentLayer: Blender models (BM-12…BM-14)', () => {
  it('starts with every fleet class procedural at LOD0', () => {
    const layer = createAgentLayer(darkPalette);
    for (const cls of FLEET_CLASS_ORDER) expect(layer.modelInfo()[cls]).toEqual({ source: 'procedural', lod: 0 });
  });

  it('swaps geometry into the same meshes, three per class, and leaves null classes procedural', () => {
    const layer = createAgentLayer(darkPalette);
    const before = meshes(layer);
    const sedan = model('sedan');
    layer.setFleetModels(new Map<VehicleClass, FleetModel | null>([['sedan', sedan], ['ev', null]]));
    const after = meshes(layer);
    expect(after.length).toBe(before.length);
    after.forEach((m, i) => expect(m).toBe(before[i]));
    expect(meshesWith(layer, sedan.lods[0].paint)).toHaveLength(1);
    expect(meshesWith(layer, sedan.lods[0].trim)).toHaveLength(1);
    expect(meshesWith(layer, sedan.lods[0].lamps)).toHaveLength(1);
    expect(layer.modelInfo().sedan).toEqual({ source: 'blender', lod: 0 });
    expect(layer.modelInfo().ev).toEqual({ source: 'procedural', lod: 0 });
    expect(layer.modelInfo().suv.source).toBe('procedural');
  });

  it('switches LODs in place and back, keeping instance colours (BM-14)', () => {
    const layer = createAgentLayer(darkPalette);
    const sedan = model('sedan');
    layer.setFleetModels(new Map([['sedan', sedan]]));
    const [paint] = meshesWith(layer, sedan.lods[0].paint);
    const colours = paint?.instanceColor;
    layer.setDetail(1);
    expect(paint?.geometry).toBe(sedan.lods[1].paint);
    expect(meshesWith(layer, sedan.lods[1].lamps)).toHaveLength(1);
    expect(paint?.instanceColor).toBe(colours);
    expect(layer.modelInfo().sedan).toEqual({ source: 'blender', lod: 1 });
    layer.setDetail(0);
    expect(paint?.geometry).toBe(sedan.lods[0].paint);
    expect(layer.modelInfo().sedan.lod).toBe(0);
  });

  it('applies the current LOD to models that arrive after a tier change', () => {
    const layer = createAgentLayer(darkPalette);
    layer.setDetail(1);
    const suv = model('suv');
    layer.setFleetModels(new Map([['suv', suv]]));
    expect(meshesWith(layer, suv.lods[1].paint)).toHaveLength(1);
    expect(layer.modelInfo().suv).toEqual({ source: 'blender', lod: 1 });
  });

  it('adds no meshes for any number of models (3 draw calls per class, V-2)', () => {
    const layer = createAgentLayer(darkPalette);
    const count = meshes(layer).length;
    layer.setFleetModels(new Map(FLEET_CLASS_ORDER.map((c) => [c, model(c)] as const)));
    layer.setDetail(1);
    expect(meshes(layer).length).toBe(count);
    for (const cls of FLEET_CLASS_ORDER) expect(layer.modelInfo()[cls].source).toBe('blender');
  });
});
