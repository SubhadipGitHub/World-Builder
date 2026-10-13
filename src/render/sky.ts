import { BackSide, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { WeatherMode } from '../config/weather';
import type { Environment } from './environment';
import { assemble, paint, place } from './kit/assemble';
import { blob } from './kit/shapes';

export interface SkyColours {
  /** #RRGGBB */
  readonly zenith: string;
  readonly horizon: string;
  readonly ground: string;
}

interface Palette3 {
  readonly zenith: string;
  readonly horizon: string;
  readonly ground: string;
}

const DAY: Palette3 = { zenith: '#3F86D6', horizon: '#C4E6F8', ground: '#9DB37E' };
const GOLDEN: Palette3 = { zenith: '#5B78B6', horizon: '#FFAE66', ground: '#A08A62' };
const NIGHT: Palette3 = { zenith: '#050916', horizon: '#18223D', ground: '#0A0C12' };
const HEAT_HORIZON = '#F5C185';
/** How far rain and overcast pull the sky towards grey. */
const GREY: Partial<Record<WeatherMode, number>> = { rain: 0.75, overcast: 0.55, fog: 0.9, storm: 0.85 };
/** Storm skies are darker as well as greyer (FE-12). */
const STORM_DARK = new Color('#2A2F3A');
/** Lightning brightens the sky by at most 35% (F12). */
const FLASH_SKY = 0.35;
const FLASH_COLOUR = new Color('#E8EEFF');

/** 1 at golden hour (around 06:30 and 18:30), fading to 0 an hour and a half either side. */
const goldenAt = (hours: number): number => Math.max(0, 1 - Math.min(Math.abs(hours - 18.5), Math.abs(hours - 6.5)) / 1.5);

function towardsGrey(c: Color, amount: number): Color {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.lerp(new Color(l, l, l), amount);
}

/**
 * Gradient sky colours (V-4, P8), a pure function: bright blue by day, warm at golden hour,
 * deep blue at night; rain and overcast are greyer (less saturated); heatwave has a warm horizon.
 */
export function skyColours(env: Environment, weather: WeatherMode): SkyColours {
  const night = env.nightFactor;
  const golden = goldenAt(env.hours) * (1 - night);
  const grey = GREY[weather] ?? 0;
  const mix = (key: keyof Palette3): string => {
    const c = new Color(DAY[key]).lerp(new Color(GOLDEN[key]), golden);
    if (weather === 'heatwave' && key === 'horizon') c.lerp(new Color(HEAT_HORIZON), 0.55);
    towardsGrey(c, grey);
    if (weather === 'storm') c.lerp(STORM_DARK, 0.45);
    c.lerp(new Color(NIGHT[key]), night);
    if (env.flash > 0) c.lerp(FLASH_COLOUR, FLASH_SKY * Math.min(1, env.flash / 0.6));
    return `#${c.getHexString()}`;
  };
  return { zenith: mix('zenith'), horizon: mix('horizon'), ground: mix('ground') };
}

// ---------- dome and clouds (P8) ----------

export interface SkyView {
  readonly group: Group;
  update(colours: SkyColours, clouds: boolean, dt: number): void;
}

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  varying vec3 vDir;
  void main() {
    float y = vDir.y;
    vec3 c = y > 0.0 ? mix(uHorizon, uZenith, pow(y, 0.55)) : mix(uHorizon, uGround, pow(-y, 0.35));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CLOUDS = 14;

/** A large gradient dome plus a few soft, drifting cloud puffs (one draw call each). */
export function createSkyView(): SkyView {
  const group = new Group();
  const uniforms = { uZenith: { value: new Color() }, uHorizon: { value: new Color() }, uGround: { value: new Color() } };
  const dome = new Mesh(new SphereGeometry(1800, 32, 16), new ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: BackSide, depthWrite: false, fog: false }));
  // Drawn after the opaque scene with the depth test on, so only uncovered sky pixels are shaded.
  dome.renderOrder = 1;
  const puff = assemble([
    place(paint(blob(22, 1), '#FFFFFF'), { scale: [1.4, 0.55, 1] }),
    place(paint(blob(16, 1), '#FFFFFF'), { x: 20, y: 4, scale: [1.2, 0.6, 1] }),
    place(paint(blob(14, 1), '#FFFFFF'), { x: -22, y: 2, scale: [1.2, 0.55, 1] }),
  ]);
  const clouds = new InstancedMesh(puff, new MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false }), CLOUDS);
  const positions = Array.from({ length: CLOUDS }, (_, i) => new Vector3(-700 + ((i * 397) % 1400), 170 + ((i * 53) % 70), -600 + ((i * 271) % 1200)));
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  group.add(dome, clouds);

  return {
    group,
    update(colours, showClouds, dt) {
      uniforms.uZenith.value.set(colours.zenith);
      uniforms.uHorizon.value.set(colours.horizon);
      uniforms.uGround.value.set(colours.ground);
      clouds.visible = showClouds;
      if (!showClouds) return;
      positions.forEach((p, i) => {
        p.x += dt * (2 + (i % 3));
        if (p.x > 700) p.x -= 1400;
        clouds.setMatrixAt(i, m.compose(p, q.identity(), s.setScalar(0.8 + (i % 4) * 0.15)));
      });
      clouds.instanceMatrix.needsUpdate = true;
    },
  };
}
