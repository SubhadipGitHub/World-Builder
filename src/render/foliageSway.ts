import { Vector2, type Material } from 'three';
import type { Wind } from './wind';

// Foliage sway (M9, FE-13, architecture F13): a vertex-shader patch on the instanced foliage materials.

/** Marker injected into the vertex shader, so tests can check the patch is in place. */
export const SWAY_CHUNK_MARKER = '// goldlane:foliage-sway';

export interface FoliageSway {
  /** Updates the shared uniforms once per frame; `enabled` false (tier 2, reduced motion) stills the foliage. */
  update(wind: Wind, tSec: number, enabled: boolean): void;
}

const DECLARATIONS = /* glsl */ `
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uSwayTime;`;

/**
 * Bends the crown downwind: offset ∝ h² (h = height above the instance base, so the trunk foot stays put), a steady
 * lean plus a sway whose phase comes from the instance position. The wind direction is turned into the instance's
 * own frame, so rotated trees still bend the same way.
 */
const CHUNK = /* glsl */ `
${SWAY_CHUNK_MARKER}
{
  float swayH = max(transformed.y, 0.0);
  #ifdef USE_INSTANCING
    vec3 swayBase = instanceMatrix[3].xyz;
    vec3 swayDir = normalize(transpose(mat3(instanceMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y));
  #else
    vec3 swayBase = vec3(0.0);
    vec3 swayDir = vec3(uWindDir.x, 0.0, uWindDir.y);
  #endif
  float swayPhase = swayBase.x * 0.13 + swayBase.z * 0.11;
  float swayAmount = uWindStrength * 0.012 * swayH * swayH * (0.6 + 0.4 * sin(uSwayTime * 1.7 + swayPhase));
  transformed.xz += swayDir.xz * swayAmount;
}`;

/** Patches `onBeforeCompile` of each material: sway grows with height above the instance base (h²). */
export function patchFoliageSway(materials: readonly Material[]): FoliageSway {
  const uniforms = {
    uWindDir: { value: new Vector2(1, 0) },
    uWindStrength: { value: 0 },
    uSwayTime: { value: 0 },
  };
  for (const material of materials) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${DECLARATIONS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${CHUNK}`);
    };
    material.customProgramCacheKey = () => 'goldlane-foliage-sway';
  }
  return {
    update(wind, tSec, enabled) {
      uniforms.uWindDir.value.set(Math.cos(wind.dirRad), Math.sin(wind.dirRad));
      uniforms.uWindStrength.value = enabled ? wind.strength * (0.15 + 0.85 * wind.gust) : 0;
      uniforms.uSwayTime.value = tSec;
    },
  };
}
