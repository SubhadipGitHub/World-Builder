import type { Material } from 'three';
import { notImplemented } from '../shared/notImplemented';
import type { Wind } from './wind';

// Foliage sway (M9, FE-13, architecture F13): a vertex-shader patch on the instanced foliage materials.

/** Marker injected into the vertex shader, so tests can check the patch is in place. */
export const SWAY_CHUNK_MARKER = '// goldlane:foliage-sway';

export interface FoliageSway {
  /** Updates the shared uniforms once per frame; `enabled` false (tier 2, reduced motion) stills the foliage. */
  update(wind: Wind, tSec: number, enabled: boolean): void;
}

/** Patches `onBeforeCompile` of each material: sway grows with height above the instance base (h²). */
export function patchFoliageSway(materials: readonly Material[]): FoliageSway {
  return notImplemented(materials);
}
