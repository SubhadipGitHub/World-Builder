import type { VehicleClass } from '../../sim/types';
import { notImplemented } from '../../shared/notImplemented';
import type { Palette } from '../palette';
import type { VehicleAsset } from './vehicles';

// M10 Blender car models (requirements §15, architecture §23): decode the committed .glb files into the
// same { paint, trim, lamps } parts the procedural cars use, checked against the model contract.

/** 0 = mid-poly (tiers 0–1), 1 = low-poly (tier 2) (BM-8, M10-9). */
export type Lod = 0 | 1;

export interface FleetModel {
  readonly lods: Readonly<Record<Lod, VehicleAsset>>;
}

/** Trim vertices authored in this colour become `palette.glass` (M10-3). */
export const GLASS_SENTINEL = '#FF00FF';
/** Trim vertices authored in this colour become `brand.colors.accent` (M10-3, D5). */
export const LIVERY_SENTINEL = '#00FFFF';
/** Triangles per class, all three parts together (BM-8). */
export const TRIANGLE_BUDGET: Readonly<Record<Lod, number>> = { 0: 6000, 1: 1500 };

/** The quality tier's LOD: tier 2 uses LOD1, tiers 0 and 1 use LOD0 (BM-14, M10-9). */
export function lodForTier(tier: number): Lod {
  return notImplemented(tier);
}

/**
 * Every BM-4…BM-8 violation of a decoded model, each message starting with its rule id ("BM-5: …");
 * [] means it conforms. Pure, so it runs on synthetic geometry in tests.
 */
export function checkModelContract(model: FleetModel, cls: VehicleClass): string[] {
  return notImplemented(model, cls);
}

/**
 * Parses one class's .glb (meshopt-compressed, LOD0 and LOD1 root nodes), dequantises, merges by material
 * into the three parts, replaces the sentinels from `palette` and `brand`, and checks the contract.
 * Rejects on a parse failure, images or textures, missing LOD nodes, or any contract violation.
 */
export function decodeFleetModel(bytes: Uint8Array, cls: VehicleClass, palette: Palette): Promise<FleetModel> {
  return notImplemented(bytes, cls, palette);
}

/**
 * Decodes every fleet class from `sources` (data URIs; defaults to the committed models). Each class
 * settles on its own: a missing, broken or non-conforming model gives `null` and one `console.warn`
 * naming the class (BM-13, M10-6).
 */
export function loadFleetModels(palette: Palette, sources?: Readonly<Partial<Record<VehicleClass, string>>>): Promise<Map<VehicleClass, FleetModel | null>> {
  return notImplemented(palette, sources);
}
