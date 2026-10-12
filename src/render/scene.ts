import { ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Palette } from './palette';

export interface SceneHandle {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  /** Matches the drawing buffer and camera to the container size. */
  resize(): void;
}

const isTouch = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Renderer, camera and lights (architecture A5, A8). */
export function createScene(container: HTMLElement, palette: Palette): SceneHandle {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch() ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(new Color(palette.background));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '3D view of the GoldLane hub');
  container.appendChild(canvas);

  const scene = new Scene();
  scene.background = new Color(palette.background);

  // Narrow field of view reads as isometric while keeping depth cues (A5).
  const camera = new PerspectiveCamera(30, 1, 1, 4000);

  scene.add(new HemisphereLight(palette.skyLight, palette.groundLight, 1.6));
  const sun = new DirectionalLight('#FFF4E2', 2.4);
  sun.position.set(-160, 320, 140);
  sun.target.position.set(10, 0, 40);
  sun.castShadow = true;
  const size = isTouch() ? 1024 : 2048;
  sun.shadow.mapSize.set(size, size);
  const cam = sun.shadow.camera;
  cam.left = -280;
  cam.right = 280;
  cam.top = 260;
  cam.bottom = -260;
  cam.near = 10;
  cam.far = 900;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  return { renderer, scene, camera, canvas, resize };
}
