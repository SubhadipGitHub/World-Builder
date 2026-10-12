import { Vector3, type PerspectiveCamera } from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import type { Vec2 } from '../sim/types';
import { clampState, followTarget, glideDuration, startGlide, stepGlide, type CameraLimits, type CameraState, type Glide } from './cameraMath';

export interface CameraRig {
  /** Call once per frame. */
  update(dt: number): void;
  /** Eased flight to a ground point, optionally changing distance and azimuth (I-2, I-5). */
  glideTo(target: Vec2, distance?: number, azimuth?: number): void;
  /** Follow a moving point until set to null (I-2). The point may be null while unknown. */
  setFollow(point: (() => Vec2 | null) | null): void;
  state(): CameraState;
  /** Sets the camera instantly (start-up). */
  jump(state: CameraState): void;
}

const FOLLOW_STIFFNESS = 5;

/**
 * MapControls for input (left-drag pan, right-drag rotate, wheel/pinch zoom), clamped by
 * cameraMath; glides and follow drive the same target. A manual drag cancels a glide, but a
 * follow continues until the selection is cleared (decision 2026-10-12).
 */
export function createCameraRig(camera: PerspectiveCamera, dom: HTMLElement, limits: CameraLimits): CameraRig {
  const controls = new MapControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = limits.minDistance;
  controls.maxDistance = limits.maxDistance;
  controls.minPolarAngle = limits.minPolar;
  controls.maxPolarAngle = limits.maxPolar;
  controls.zoomSpeed = 1.2;

  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let glide: Glide | null = null;
  let follow: (() => Vec2 | null) | null = null;
  controls.addEventListener('start', () => {
    glide = null;
  });

  const offset = new Vector3();
  const read = (): CameraState => {
    offset.copy(camera.position).sub(controls.target);
    const distance = offset.length();
    return {
      target: { x: controls.target.x, z: controls.target.z },
      distance,
      azimuth: Math.atan2(offset.x, offset.z),
      polar: Math.acos(Math.min(1, Math.max(-1, offset.y / Math.max(distance, 1e-6)))),
    };
  };
  const apply = (s: CameraState): void => {
    controls.target.set(s.target.x, 0, s.target.z);
    const r = s.distance * Math.sin(s.polar);
    camera.position.set(s.target.x + r * Math.sin(s.azimuth), s.distance * Math.cos(s.polar), s.target.z + r * Math.cos(s.azimuth));
    camera.lookAt(controls.target);
  };

  return {
    update(dt) {
      if (glide) {
        // Gliding to a followed object: keep aiming at where it is now, so the glide lands on it.
        const live = follow?.();
        if (live) glide = { ...glide, to: { ...glide.to, target: live } };
        const r = stepGlide(glide, dt);
        glide = r.glide;
        apply(clampState(r.state, limits));
        return;
      }
      controls.update();
      let s = read();
      const p = follow?.();
      if (p) s = followTarget(s, p, dt, FOLLOW_STIFFNESS);
      apply(clampState(s, limits));
    },
    glideTo(target, distance, azimuth) {
      const from = read();
      const to = clampState({ ...from, target, distance: distance ?? from.distance, azimuth: azimuth ?? from.azimuth }, limits);
      glide = startGlide(from, to, glideDuration(from, to, reducedMotion));
    },
    setFollow(point) {
      follow = point;
    },
    state: read,
    jump(s) {
      glide = null;
      apply(clampState(s, limits));
      controls.update();
    },
  };
}
