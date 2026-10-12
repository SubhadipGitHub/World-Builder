import { Color, FogExp2, type DirectionalLight, type HemisphereLight, type Scene, type WebGLRenderer } from 'three';
import type { Vec2 } from '../sim/types';
import type { AgentLayer } from './agents';
import type { Environment } from './environment';
import type { Palette } from './palette';
import type { RainField } from './rain';
import type { WorldHandle } from './world';

export interface Atmosphere {
  /** Applies one frame of lighting, fog, wetness, night lights and rain (X-1, X-2). */
  apply(env: Environment, dt: number, around: Vec2): void;
  setPalette(palette: Palette): void;
}

interface Parts {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
  readonly world: WorldHandle;
  readonly agents: AgentLayer;
  readonly rain: RainField;
}

const SUN_AZIMUTH = 2.4;
const NIGHT_SKY = new Color('#0B0D14');
const NIGHT_SUN = new Color('#9FB4FF');
const DAY_SUN = new Color('#FFF4E2');
const HEAT_SUN = new Color('#FFD39A');
const NIGHT_HEMI = new Color('#2A3550');

export function createAtmosphere(parts: Parts, palette: Palette): Atmosphere {
  const { renderer, scene, hemi, sun, world, agents, rain } = parts;
  let base = palette;
  const background = new Color();
  const fogColour = new Color();
  const skyBase = new Color(palette.skyLight);
  const fog = new FogExp2('#888888', 0);

  return {
    apply(env, dt, around) {
      const nf = env.nightFactor;

      background.set(base.background).lerp(NIGHT_SKY, 0.85 * nf);
      scene.background = background;
      renderer.setClearColor(background);

      // Keep the light a little above the horizon at night so it reads as moonlight with soft shadows.
      const elevation = Math.max(env.sunElevation, 0.45);
      const r = 400 * Math.cos(elevation);
      sun.position.set(around.x + r * Math.cos(SUN_AZIMUTH), 400 * Math.sin(elevation), around.z + r * Math.sin(SUN_AZIMUTH));
      sun.target.position.set(around.x, 0, around.z);
      sun.target.updateMatrixWorld();
      sun.intensity = env.sunIntensity;
      sun.color.copy(env.heat ? HEAT_SUN : DAY_SUN).lerp(NIGHT_SUN, nf);

      hemi.intensity = env.ambientIntensity;
      hemi.color.copy(skyBase).lerp(NIGHT_HEMI, nf);

      if (env.fogDensity > 0) {
        fogColour.set(env.rain ? '#7D8594' : env.heat ? '#C9B79A' : '#A8ADB8').lerp(NIGHT_SKY, nf);
        fog.color.copy(fogColour);
        fog.density = env.fogDensity;
        scene.fog = fog;
      } else {
        scene.fog = null;
      }

      renderer.toneMappingExposure = env.heat ? 1.08 : 1;
      world.setConditions({ wetness: env.wetness, night: nf });
      agents.setNight(nf);
      rain.update(env.rain, dt, around, env.wetness);
    },
    setPalette(p) {
      base = p;
      skyBase.set(p.skyLight);
      hemi.groundColor.set(p.groundLight);
      world.setPalette(p);
      agents.setPalette(p);
    },
  };
}
