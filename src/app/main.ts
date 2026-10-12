import { signal } from '@preact/signals';
import { h, render } from 'preact';
import { Raycaster, Vector2, Vector3 } from 'three';
import { rates } from '../config/rates';
import type { AreaId } from '../layout/hub';
import { areaById, hubBounds, unitMarker, unitPose } from '../layout/positions';
import { createAgentLayer } from '../render/agents';
import { createCameraRig } from '../render/camera';
import type { CameraLimits } from '../render/cameraMath';
import { interpolateAgents, type PoseSample } from '../render/interp';
import { darkPalette } from '../render/palette';
import { createScene } from '../render/scene';
import { createSelectionRing } from '../render/selection';
import { buildWorld } from '../render/world';
import type { Vec2 } from '../sim/types';
import { createSim, type Snapshot } from '../sim/world';
import { unitLabel } from '../ui/format';
import { App } from '../ui/m1/App';
import { createUiStore } from '../ui/store';
import '../ui/styles.css';
import { createThroughputTracker } from '../ui/throughput';
import { createAccumulator } from './loop';
import type { HubTestHooks } from './testHooks';
import { notImplemented } from '../shared/notImplemented';
import { hasWebGL2 } from './webgl';

const CLICK_MAX_MOVE_PX = 5;
const CLICK_MAX_MS = 300;
const PICK_RADIUS_PX = 14;
const PANEL_REFRESH_SEC = 0.1;
const SELECT_DISTANCE = 90;

function showFallback(root: HTMLElement): void {
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fallback';
  box.setAttribute('role', 'alert');
  box.innerHTML =
    '<div><h1>This view needs WebGL 2</h1><p>Open the hub in a recent version of Chrome, Edge, Safari or Firefox with hardware acceleration turned on.</p></div>';
  root.appendChild(box);
}

function start(root: HTMLElement): void {
  const palette = darkPalette;
  const sim = createSim({ seed: 'goldlane' });
  const store = createUiStore();
  const throughput = createThroughputTracker();

  const sceneHandle = createScene(root, palette);
  const { renderer, scene, camera, canvas } = sceneHandle;
  const world = buildWorld(palette);
  const agents = createAgentLayer(palette);
  const ring = createSelectionRing(palette);
  scene.add(world.group, agents.group, ring.mesh);

  const bounds = hubBounds(20);
  const limits: CameraLimits = { ...bounds, minDistance: 25, maxDistance: 600, minPolar: 0.35, maxPolar: 1.25 };
  const rig = createCameraRig(camera, canvas, limits);
  const overview = areaById('overview');
  rig.jump({ target: { x: overview.x, z: overview.z }, distance: overview.distance, azimuth: Math.PI / 4, polar: 0.85 });

  // Overlay: Preact app plus a selection label positioned every frame (A7).
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  root.appendChild(overlay);
  const uiRoot = document.createElement('div');
  overlay.appendChild(uiRoot);
  const label = document.createElement('div');
  label.className = 'selection-label';
  label.dataset.testid = 'selection-label';
  label.hidden = true;
  overlay.appendChild(label);

  let prev: Snapshot = sim.snapshot();
  let curr: Snapshot = prev;
  let poses: Map<string, PoseSample> = interpolateAgents(prev.agents, curr.agents, 0);
  const uiSnapshot = signal<Snapshot | null>(curr);
  throughput.observe(curr.resources, curr.simTimeSec);

  const onArea = (id: AreaId): void => {
    // Switching area deselects, so "following ⇔ selected" stays true (architecture §14.1).
    store.clearSelection();
    store.setArea(id);
    const a = areaById(id);
    rig.glideTo({ x: a.x, z: a.z }, a.distance);
  };
  render(h(App, { store, snapshot: uiSnapshot, throughput, onArea }), uiRoot);

  // ---------- selection ----------

  const positionOf = (id: string): Vec2 | null => {
    const pose = agents.poseOf(id);
    if (pose) return { x: pose.x, z: pose.z };
    try {
      const p = unitPose(id);
      return { x: p.x, z: p.z };
    } catch {
      return null;
    }
  };

  store.selection.subscribe((sel) => {
    if (sel === null) {
      rig.setFollow(null);
      return;
    }
    const p = positionOf(sel.id);
    if (p) rig.glideTo(p, Math.min(rig.state().distance, SELECT_DISTANCE));
    rig.setFollow(() => positionOf(sel.id));
  });

  // ---------- picking (I-2, I-6) ----------

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const projected = new Vector3();

  const toScreen = (x: number, y: number, z: number): { x: number; y: number } | null => {
    projected.set(x, y, z).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((projected.x + 1) / 2) * rect.width, y: rect.top + ((1 - projected.y) / 2) * rect.height };
  };

  const pickAt = (clientX: number, clientY: number): void => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const unit = world.pickUnit(raycaster);
    if (unit) {
      store.select({ kind: 'resource', id: unit });
      return;
    }
    const agent = agents.pick(raycaster);
    if (agent) {
      store.select({ kind: 'agent', id: agent });
      return;
    }
    // Small objects far away: accept the nearest projected agent or marker within a few pixels.
    let best: { id: string; kind: 'agent' | 'resource'; d: number } | null = null;
    for (const a of curr.agents) {
      const pose = agents.poseOf(a.id);
      const p = pose ? toScreen(pose.x, 0.8, pose.z) : null;
      const d = p ? Math.hypot(p.x - clientX, p.y - clientY) : Infinity;
      if (d < PICK_RADIUS_PX && (!best || d < best.d)) best = { id: a.id, kind: 'agent', d };
    }
    for (const id of world.unitIds) {
      const m = unitMarker(id);
      const p = toScreen(m.x, 1, m.z);
      const d = p ? Math.hypot(p.x - clientX, p.y - clientY) : Infinity;
      if (d < PICK_RADIUS_PX && (!best || d < best.d)) best = { id, kind: 'resource', d };
    }
    if (best) store.select({ kind: best.kind, id: best.id });
    else store.clearSelection();
  };

  let press: { x: number; y: number; t: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    press = e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!press || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    const quick = performance.now() - press.t <= CLICK_MAX_MS;
    press = null;
    if (moved <= CLICK_MAX_MOVE_PX && quick) pickAt(e.clientX, e.clientY);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') store.clearSelection();
  });
  window.addEventListener('resize', () => {
    sceneHandle.resize();
  });

  // ---------- loop (A3) ----------

  const accumulator = createAccumulator(rates.stepWallSec, 5);
  let last = performance.now();
  let panelClock = 0;
  let elapsed = 0;
  let ready = false;
  let drawCalls = 0;

  const frame = (now: number): void => {
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    elapsed += dt;
    const { steps, alpha } = accumulator.push(dt);
    if (steps > 0) {
      for (let i = 0; i < steps - 1; i++) sim.step();
      prev = steps > 1 ? sim.snapshot() : curr;
      sim.step();
      curr = sim.snapshot();
      sim.drainEvents();
      throughput.observe(curr.resources, curr.simTimeSec);
    }
    poses = interpolateAgents(prev.agents, curr.agents, alpha);
    agents.update(curr.agents, poses);

    const sel = store.selection.value;
    const selPos = sel ? positionOf(sel.id) : null;
    if (sel && selPos) {
      const agent = sel.kind === 'agent' ? curr.agents.find((a) => a.id === sel.id) : undefined;
      ring.show(selPos.x, selPos.z, agent ? agent.length / 2 + 1.2 : 3.6, elapsed);
      const anchor = sel.kind === 'resource' ? unitMarker(sel.id) : selPos;
      const p = toScreen(anchor.x, sel.kind === 'resource' ? 2.6 : 3, anchor.z);
      label.textContent = sel.kind === 'agent' ? sel.id : unitLabel(sel.id);
      label.hidden = p === null;
      if (p) label.style.transform = `translate(${String(p.x)}px, ${String(p.y)}px) translate(-50%, -110%)`;
    } else {
      ring.hide();
      label.hidden = true;
    }

    rig.update(dt);
    renderer.render(scene, camera);
    drawCalls = renderer.info.render.calls;

    panelClock += dt;
    if (panelClock >= PANEL_REFRESH_SEC) {
      panelClock = 0;
      uiSnapshot.value = curr;
    }
    ready = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (import.meta.env.VITE_TEST_HOOKS === '1') {
    const hooks: HubTestHooks = {
      get ready() {
        return ready;
      },
      agents: () => curr.agents.map((a) => ({ id: a.id, kind: a.kind, speed: a.speed })),
      screenPosition(id) {
        const pose = agents.poseOf(id);
        if (pose) return toScreen(pose.x, 0.8, pose.z);
        if (!world.unitIds.includes(id)) return null;
        const m = unitMarker(id);
        return toScreen(m.x, 1, m.z);
      },
      selection: () => store.selection.value?.id ?? null,
      cameraTarget: () => rig.state().target,
      cameraDistance: () => rig.state().distance,
      areaTarget(id) {
        const a = areaById(id);
        return { x: a.x, z: a.z };
      },
      drawCalls: () => drawCalls,
      // M2 hooks: wired in Stage 4.
      weather: () => notImplemented(),
      environment: () => notImplemented(),
      theme: () => notImplemented(),
      qualityTier: () => notImplemented(),
    };
    window.__hub = hooks;
  }
}

const root = document.getElementById('app');
if (root) {
  if (hasWebGL2(document)) start(root);
  else showFallback(root);
}
