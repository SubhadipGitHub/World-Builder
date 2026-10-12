import { Vector2, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type PostEffect = 'bloom' | 'shimmer';

export interface PostInputs {
  readonly nightFactor: number;
  readonly qualityTier: number;
  /** From environmentFor (heatwave, motion allowed, tier 0). */
  readonly shimmer: boolean;
}

/** Bloom starts once dusk is under way. */
const BLOOM_FROM_NIGHT = 0.05;

/**
 * Which post effects run this frame (P6): bloom at night (nightFactor > 0.05) on tier 0 only (V-7);
 * shimmer when the environment asks for it. Order: bloom, then shimmer. Empty = plain render.
 */
export function postEffectsFor(inputs: PostInputs): readonly PostEffect[] {
  const out: PostEffect[] = [];
  if (inputs.qualityTier === 0 && inputs.nightFactor > BLOOM_FROM_NIGHT) out.push('bloom');
  if (inputs.shimmer) out.push('shimmer');
  return out;
}

// ---------- composer (P6) ----------

export interface PostPipeline {
  /** Renders the frame with the given effects; with none, a plain render. */
  render(effects: readonly PostEffect[], timeSec: number): void;
  setSize(width: number, height: number, pixelRatio: number): void;
}

const ShimmerShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      // Rising heat haze, stronger towards the ground (bottom of the screen), with a warm grade.
      float strength = 0.0016 * (1.2 - vUv.y);
      vec2 offset = vec2(
        sin(vUv.y * 90.0 + uTime * 3.1) + 0.5 * sin(vUv.y * 211.0 - uTime * 4.7),
        cos(vUv.x * 70.0 + uTime * 2.3)
      ) * strength;
      vec4 color = texture2D(tDiffuse, vUv + offset);
      color.rgb *= vec3(1.06, 1.0, 0.9);
      gl_FragColor = color;
    }
  `,
};

/** RenderPass → bloom → shimmer → OutputPass; passes switch on only when their effect is requested. */
export function createPostPipeline(renderer: WebGLRenderer, scene: Scene, camera: Camera): PostPipeline {
  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.85, 0.55, 0.82);
  const shimmer = new ShaderPass(ShimmerShader);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(shimmer);
  composer.addPass(new OutputPass());
  const size = new Vector2();
  renderer.getSize(size);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);

  return {
    render(effects, timeSec) {
      if (effects.length === 0) {
        renderer.render(scene, camera);
        return;
      }
      bloom.enabled = effects.includes('bloom');
      shimmer.enabled = effects.includes('shimmer');
      (shimmer.uniforms.uTime as { value: number }).value = timeSec;
      composer.render();
    },
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
  };
}
