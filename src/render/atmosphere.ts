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
/** Lightning tint (FE-12). */
const FLASH_HEMI = new Color('#DCE6FF');
/** Extra fog density at full morning mist (FE-11). */
const MIST_FOG = 0.0035;

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

      // A lightning flash lifts the ambient light (capped in render/lightning, F12).
      hemi.intensity = env.ambientIntensity + 2.5 * env.flash;
      hemi.color.copy(skyBase).lerp(NIGHT_HEMI, nf).lerp(FLASH_HEMI, Math.min(1, env.flash * 1.5));

      const density = env.fogDensity + MIST_FOG * env.mist;
      if (density > 0) {
        fogColour.set(env.fog ? '#C3C7CE' : env.rain ? '#7D8594' : env.heat ? '#C9B79A' : '#A8ADB8').lerp(NIGHT_SKY, nf * (env.fog ? 0.7 : 1));
        fog.color.copy(fogColour);
        fog.density = density;
        scene.fog = fog;
      } else {
        scene.fog = null;
      }

      renderer.toneMappingExposure = env.heat ? 1.08 : 1;
      world.setConditions({ wetness: env.wetness, night: nf });
      // Fog (FE-11): headlights on in daytime too.
      agents.setNight(env.headlightsByDay ? Math.max(nf, 0.7) : nf);
      rain.update(env.rain, dt, around, env.storm ? 1.3 : env.wetness, env.wind);
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
