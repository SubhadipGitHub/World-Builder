import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { SWAY_CHUNK_MARKER, patchFoliageSway } from '../../../src/render/foliageSway';

// M9 (FE-13; architecture F13): a guard against three upgrades breaking the shader patch.

const fakeShader = (): WebGLProgramParametersWithUniforms =>
  ({ vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}', fragmentShader: '', uniforms: {} }) as unknown as WebGLProgramParametersWithUniforms;

describe('patchFoliageSway', () => {
  it('injects the sway chunk after begin_vertex and adds the wind uniforms', () => {
    const mat = new MeshStandardMaterial();
    patchFoliageSway([mat]);
    const shader = fakeShader();
    mat.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.vertexShader).toContain(SWAY_CHUNK_MARKER);
    expect(shader.vertexShader.indexOf(SWAY_CHUNK_MARKER)).toBeGreaterThan(shader.vertexShader.indexOf('#include <begin_vertex>'));
    expect(Object.keys(shader.uniforms).sort()).toEqual(['uSwayTime', 'uWindDir', 'uWindStrength']);
  });

  it('updates shared uniforms, and zero strength when disabled', () => {
    const a = new MeshStandardMaterial();
    const b = new MeshStandardMaterial();
    const sway = patchFoliageSway([a, b]);
    const sa = fakeShader();
    const sb = fakeShader();
    a.onBeforeCompile(sa, {} as WebGLRenderer);
    b.onBeforeCompile(sb, {} as WebGLRenderer);
    sway.update({ dirRad: 0, strength: 0.8, gust: 0.5 }, 12, true);
    expect(sa.uniforms.uWindStrength).toBe(sb.uniforms.uWindStrength);
    expect((sa.uniforms.uWindStrength as { value: number }).value).toBeGreaterThan(0);
    expect((sa.uniforms.uSwayTime as { value: number }).value).toBe(12);
    sway.update({ dirRad: 0, strength: 0.8, gust: 0.5 }, 13, false);
    expect((sa.uniforms.uWindStrength as { value: number }).value).toBe(0);
  });
});
