import { notImplemented } from '../shared/notImplemented';
import { signal } from '@preact/signals';
import { h, render } from 'preact';
import { Raycaster, Vector2, Vector3 } from 'three';
import { rates } from '../config/rates';
import type { PresetId } from '../config/scenarios';
import { weather as weatherTable, type WeatherMode } from '../config/weather';
import { hub, type AreaId } from '../layout/hub';
import { areaById, unitMarker, unitPose } from '../layout/positions';
import { createAgentLayer } from '../render/agents';
import { createAtmosphere } from '../render/atmosphere';
import { createCameraRig } from '../render/camera';
import type { CameraLimits } from '../render/cameraMath';
import { environmentFor, type DayNight, type Environment } from '../render/environment';
import { detailStates } from '../render/details';
import { interpolateAgents, type PoseSample } from '../render/interp';
import { darkPalette, lightPalette } from '../render/palette';
import { createPostPipeline, postEffectsFor, type PostEffect } from '../render/post';
import { createQualityController, settingsFor } from '../render/quality';
import { createRain } from '../render/rain';
import { createScene } from '../render/scene';
import { createSelectionRing } from '../render/selection';
import { airportPlan } from '../airport/plan';
import { airportTexts, createAirportView } from '../render/airport/view';
import { createSiteView } from '../render/site';
import { signEntries } from '../render/site/signs';
import { createTextAtlas } from '../render/text/atlas';
import { sitePlan } from '../layout/site';
import { createSkyView, skyColours } from '../render/sky';
import { buildWorld } from '../render/world';
import type { Vec2 } from '../sim/types';
import type { ScenarioCommand } from '../sim/scenario';
import { createSim, type Command, type Metrics, type Snapshot } from '../sim/world';
import { createAlertFeed } from '../ui/alerts';
import { formatClock, unitLabel } from '../ui/format';
import { COMPACT_DISTANCE, FACILITIES, declutter, facilityStatuses, type FacilityId, type FacilityStatus } from '../ui/facilities';
import { createKpiTracker, type KpiId } from '../ui/kpis';
import { PLACES, type PlaceId } from '../ui/places';
import { DEFAULT_VOLUME, LABELS_KEY, loadFlag, saveFlag } from '../ui/prefs';
import { cameraLimits } from './limits';
import type { Speed } from '../ui/m4/SpeedControl';
import {
  createWeatherMemory,
  deltaVisible,
  isOutageable,
  kpiDelta,
  offlineReason,
  outageGroups,
  presetCommands,
  queueSummary,
  type KpiDelta,
} from '../ui/scenario';
import { Dashboard, type DashboardData, type Settings, type TableData } from '../ui/m2/Dashboard';
import { createUiStore } from '../ui/store';
import '../ui/styles.css';
import { createCheckoutLog, fleetRows, queueRows } from '../ui/tables';
import { loadTheme, saveTheme, type Theme, type ThemeStorage } from '../ui/theme';
import { createThroughputTracker } from '../ui/throughput';
import { createTimeline } from '../ui/timeline';
import { createAccumulator } from './loop';
import { kioskFact, screenshotCaption, screenshotFileName } from '../share/caption';
import { SHORTCUTS } from '../share/help';
import { KIOSK_AREAS, KIOSK_DWELL_SEC, KIOSK_IDLE_SEC, createKioskScheduler, type KioskScheduler } from '../share/kiosk';
import { LINK_DEFAULTS, formatLink, parseLink, toSpeed, toSpeedLink, type LinkState } from '../share/link';
import { demandText } from '../ui/demand';
import type { KioskView, ShareActions, ShareState, UiMode } from '../ui/m8/types';
import { captureFrame, downloadBlob } from './capture';
import { copyText } from './clipboard';
import { requestWakeLock, type WakeLockHandle } from './wakeLock';
import type { HubTestHooks } from './testHooks';
import { hasWebGL2 } from './webgl';

const CLICK_MAX_MOVE_PX = 5;
const CLICK_MAX_MS = 300;
const PICK_RADIUS_PX = 14;
/** Panel, tracker and KPI refresh (architecture §5). */
const PANEL_REFRESH_SEC = 0.1;
/** Table refresh (architecture §5). */
const TABLE_REFRESH_SEC = 0.25;
const SELECT_DISTANCE = 90;
/** Kiosk orbit while dwelling on an area (J6), degrees per second. */
const KIOSK_ORBIT_DEG = 0.6;
/** How long a "Link copied" style notice stays (ms). */
const NOTICE_MS = 2_500;
/** Longest wall-time step the kiosk takes from one frame (a stalled tab does not skip areas). */
const KIOSK_MAX_STEP_SEC = 5;
const DEG = 180 / Math.PI;
const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

function showFallback(root: HTMLElement): void {
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fallback';
  box.setAttribute('role', 'alert');
  box.innerHTML =
    '<div><h1>This view needs WebGL 2</h1><p>Open the hub in a recent version of Chrome, Edge, Safari or Firefox with hardware acceleration turned on.</p></div>';
  root.appendChild(box);
}

function safeStorage(): ThemeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isTouch = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function start(root: HTMLElement): void {
  const storage = safeStorage();
  // Deep link (SH-5, J1–J3): read once at start; it never writes the viewer's saved preferences.
  const parsed = parseLink(location.search);
  if (parsed.ignored.length > 0) console.info(`Ignored link options: ${parsed.ignored.join(', ')}`);
  const link: LinkState = { ...LINK_DEFAULTS, ...parsed.state };
  let theme: Theme = link.theme ?? loadTheme(storage);
  document.documentElement.dataset.theme = theme;
  const paletteFor = (t: Theme) => (t === 'light' ? lightPalette : darkPalette);

  const sim = createSim({ seed: link.seed });
  // Shadow baseline (S-11, W7): same seed, same weather and speed, never any scenario lever.
  const baseline = createSim({ seed: link.seed });
  if (link.weather !== LINK_DEFAULTS.weather) for (const s of [sim, baseline]) s.apply({ type: 'setWeather', mode: link.weather });
  const weatherMemory = createWeatherMemory();
  const outages = outageGroups();
  const store = createUiStore();
  const throughput = createThroughputTracker();
  const timeline = createTimeline();
  const alertFeed = createAlertFeed();
  const checkoutLog = createCheckoutLog();
  const kpis = createKpiTracker();

  const sceneHandle = createScene(root, paletteFor(theme));
  const { renderer, scene, camera, canvas, hemi, sun } = sceneHandle;
  renderer.info.autoReset = false;
  const world = buildWorld(paletteFor(theme));
  const agents = createAgentLayer(paletteFor(theme));
  const ring = createSelectionRing(paletteFor(theme));
  const rain = createRain();
  const sky = createSkyView();
  // One text atlas for the hub site and the airport (H7).
  const atlas = createTextAtlas([...signEntries(sitePlan()), ...airportTexts()]);
  const site = createSiteView(paletteFor(theme), atlas);
  const airport = createAirportView(paletteFor(theme), atlas);
  scene.add(sky.group, site.group, airport.group, world.group, agents.group, ring.mesh, rain.mesh);
  const atmosphere = createAtmosphere({ renderer, scene, hemi, sun, world, agents, rain }, paletteFor(theme));
  atmosphere.setPalette(paletteFor(theme));
  const post = createPostPipeline(renderer, scene, camera);
  const resize = (): void => {
    sceneHandle.resize();
    const size = renderer.getSize(new Vector2());
    post.setSize(size.x, size.y, renderer.getPixelRatio());
  };

  const quality = createQualityController({ touch: isTouch() });
  const applyQuality = (tier: number): void => {
    const q = settingsFor(tier);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioCap));
    sun.castShadow = q.shadowMapSize > 0;
    if (q.shadowMapSize > 0 && sun.shadow.mapSize.x !== q.shadowMapSize) {
      sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    resize();
  };
  let qualityTier = quality.tier;
  applyQuality(qualityTier);

  // The hub plus the airport, out to 1,100 m (L-2).
  const limits: CameraLimits = cameraLimits();
  const rig = createCameraRig(camera, canvas, limits);
  const overview = areaById('overview');
  rig.jump({ target: { x: overview.x, z: overview.z }, distance: overview.distance, azimuth: Math.PI / 4, polar: 0.85 });

  // Overlay: Preact dashboard plus a selection label positioned every frame (A7).
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
  throughput.observe(curr.resources, curr.simTimeSec);
  kpis.observe(sim.metrics(), curr.simTimeSec);

  let weatherMode: WeatherMode = curr.weather;
  let dayNight: DayNight = link.tod;
  const reducedMotion = prefersReducedMotion();
  let environment: Environment = environmentFor(weatherMode, curr.clockHours, dayNight, { reducedMotion, qualityTier });

  const clockAt = (t: number): string => formatClock((((curr.clockHours + (t - curr.simTimeSec) / 3600) % 24) + 24) % 24);

  let baselineMetrics: Metrics = baseline.metrics();
  let baselineQueues = queueSummary(baseline.snapshot());
  const kpiValues = (m: Metrics): Readonly<Record<KpiId, number | null>> => ({
    turnaround: m.turnaroundMin,
    utilisation: m.utilisation * 100,
    evSoc: m.readyEvSocPct,
    revenue: m.revenue.today,
  });
  /** Deltas against the baseline while a scenario is relevant (S-12). */
  const kpiDeltas = (m: Metrics): Partial<Record<KpiId, KpiDelta | null>> => {
    if (!deltaVisible(curr.scenario, curr.simTimeSec)) return {};
    const now = kpiValues(m);
    const base = kpiValues(baselineMetrics);
    return {
      turnaround: kpiDelta('turnaround', now.turnaround, base.turnaround),
      utilisation: kpiDelta('utilisation', now.utilisation, base.utilisation),
      evSoc: kpiDelta('evSoc', now.evSoc, base.evSoc),
    };
  };

  const dashboardData = (): DashboardData => {
    const sel = store.selection.value;
    const metrics = sim.metrics();
    return {
      snapshot: curr,
      cards: kpis.cards(),
      alerts: alertFeed.list(),
      unread: alertFeed.unread(),
      steps: sel?.kind === 'agent' && curr.agents.some((a) => a.id === sel.id && a.kind === 'fleet') ? timeline.stepsFor(sel.id) : null,
      stageCounts: metrics.stageCounts,
      deltas: kpiDeltas(metrics),
      facilities: settings.value.labels ? facilityStatuses(curr) : [],
      compactLabels: rig.state().distance > COMPACT_DISTANCE,
      places: settings.value.labels ? PLACES.map((p) => ({ id: p.id, name: p.name })) : [],
      queues: queueSummary(curr),
      baselineQueues,
      toasts: [], // Stage 3 placeholder (M9, FE-19)
      toastOverflow: 0,
    };
  };
  const tableData = (): TableData => ({ fleet: fleetRows(curr), queue: queueRows(curr), checkouts: checkoutLog.rows() });

  // Settings first: dashboardData() reads the labels switch.
  const settings = signal<Settings>({
    weather: weatherMode,
    dayNight,
    theme,
    speed: 1,
    labels: link.labels ?? loadFlag(storage, LABELS_KEY, true),
    // Stage 3 placeholders (M9, FE-18, FE-20): Stage 4 loads these from prefs.
    sound: false,
    volume: DEFAULT_VOLUME,
    toasts: true,
  });
  const data = signal<DashboardData>(dashboardData());

  // ---------- share: links, kiosk, screenshot, help (M8, §21) ----------

  /** The page itself, without query or hash; location.origin is "null" on file://. */
  const linkBase = location.href.split(/[?#]/)[0] ?? '';
  let mode: UiMode = link.kiosk ? 'kiosk' : link.embed ? 'embed' : 'normal';
  const share = signal<ShareState>({ mode, kiosk: null, fullViewHref: '', notice: null, copyFallback: null, helpOpen: false });
  const patchShare = (patch: Partial<ShareState>): void => {
    share.value = { ...share.value, ...patch };
  };
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  const showNotice = (text: string): void => {
    patchShare({ notice: text });
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      patchShare({ notice: null });
    }, NOTICE_MS);
  };

  /** The preset in force, untouched since it was applied (J4); any other lever or Reset clears it. */
  let activePreset: PresetId | null = null;
  /** What "Copy link" captures now (SH-7, J4). */
  const currentLinkState = (): LinkState => {
    const sel = store.selection.value;
    const cam = rig.state();
    return {
      area: store.area.value,
      // A selected unit decides the camera (it is followed), so the link carries the selection instead (J2).
      cam: sel?.kind === 'resource' ? null : { x: cam.target.x, z: cam.target.z, azimuthDeg: cam.azimuth * DEG, elevationDeg: 90 - cam.polar * DEG, distance: cam.distance },
      weather: weatherMode,
      tod: dayNight,
      speed: toSpeedLink(speed),
      labels: settings.value.labels ? null : false,
      theme: theme === 'light' ? 'light' : null,
      quality: pinnedTier === 0 || pinnedTier === 1 || pinnedTier === 2 ? pinnedTier : 'auto',
      seed: link.seed,
      preset: activePreset,
      select: sel?.kind === 'resource' ? sel.id : null,
      kiosk: mode === 'kiosk',
      embed: mode === 'embed',
    };
  };
  const currentLink = (): string => formatLink(linkBase, currentLinkState());
  const fullViewHref = (): string => formatLink(linkBase, { ...currentLinkState(), embed: false, kiosk: false });

  let kiosk: KioskScheduler | null = null;
  let wakeLock: WakeLockHandle | null = null;
  const KIOSK_INPUTS = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const;
  /** Any viewer input pauses the tour (SH-10); Esc is left to the key handler, which exits. */
  const kioskInput = (e: Event): void => {
    if (!kiosk || (e instanceof KeyboardEvent && e.key === 'Escape')) return;
    kiosk.input();
    rig.setAutoRotate(0);
  };
  const kioskFly = (id: AreaId): void => {
    onArea(id);
    rig.setAutoRotate(reducedMotion ? 0 : KIOSK_ORBIT_DEG);
  };
  const kioskView = (): KioskView | null => {
    if (!kiosk) return null;
    const k = kiosk.state();
    return {
      area: areaById(k.area).label,
      clock: formatClock(curr.clockHours),
      demand: demandText(curr.demand),
      fact: kioskFact(k.area, curr, airport.nextLandingSec()),
      resumeInSec: k.resumeInSec,
    };
  };
  const enterKiosk = (): void => {
    if (kiosk) return;
    kiosk = createKioskScheduler({ areas: KIOSK_AREAS, dwellSec: KIOSK_DWELL_SEC, idleSec: KIOSK_IDLE_SEC });
    mode = 'kiosk';
    for (const t of KIOSK_INPUTS) window.addEventListener(t, kioskInput, { passive: true });
    wakeLock = requestWakeLock();
    kioskFly(kiosk.state().area);
    patchShare({ mode, kiosk: kioskView(), helpOpen: false });
  };
  const exitKiosk = (): void => {
    if (!kiosk) return;
    kiosk.exit();
    kiosk = null;
    for (const t of KIOSK_INPUTS) window.removeEventListener(t, kioskInput);
    wakeLock?.release();
    wakeLock = null;
    rig.setAutoRotate(0);
    mode = 'normal';
    patchShare({ mode, kiosk: null });
  };
  const kioskStep = (sec: number): void => {
    const next = kiosk?.tick(sec) ?? null;
    if (next) kioskFly(next);
  };

  /** Set by P or the button; the frame loop captures right after rendering (J7). */
  let captureRequested = false;
  const takeScreenshot = (): void => {
    const caption = screenshotCaption({ area: areaById(store.area.value).label, clock: formatClock(curr.clockHours), weather: weatherTable[weatherMode].label });
    captureFrame(canvas, caption)
      .then((blob) => {
        downloadBlob(blob, screenshotFileName(new Date()));
      })
      .catch(() => {
        showNotice('Screenshot failed');
      });
  };

  const shareActions: ShareActions = {
    onCopyLink: () => {
      const url = currentLink();
      void copyText(url).then((ok) => {
        if (ok) showNotice('Link copied');
        else patchShare({ copyFallback: url });
      });
    },
    onCloseCopyFallback: () => {
      patchShare({ copyFallback: null });
    },
    onStartTour: enterKiosk,
    onExitTour: exitKiosk,
    onScreenshot: () => {
      captureRequested = true;
    },
    onOpenHelp: () => {
      patchShare({ helpOpen: true });
    },
    onCloseHelp: () => {
      patchShare({ helpOpen: false });
    },
  };
  const tables = signal<TableData>(tableData());

  // ---------- what-if commands (§9, W8) ----------

  let speed: Speed = 1;
  /** Applies commands to the visible simulation only, then shows their effect at once (even while paused). */
  const applyVisible = (commands: readonly Command[]): void => {
    for (const c of commands) sim.apply(c);
    // A demand surge also brings in a visible extra flight (F-2).
    if (commands.some((c) => c.type === 'surge')) airport.surge();
    const events = sim.drainEvents();
    timeline.ingest(events);
    alertFeed.ingest(events);
    checkoutLog.ingest(events);
    // Same tick, so agents are unchanged: only the scenario view and unit flags differ.
    curr = sim.snapshot();
    data.value = dashboardData();
  };
  const setVisibleWeather = (mode: WeatherMode): void => {
    weatherMode = mode;
    settings.value = { ...settings.value, weather: mode };
  };
  const scenarioCommand = (command: ScenarioCommand): void => {
    activePreset = null;
    applyVisible([command]);
  };
  const applyPreset = (id: PresetId): void => {
    const plan = presetCommands(id);
    weatherMemory.onPreset(weatherMode, plan.weather);
    const commands: Command[] = [...plan.commands];
    if (plan.weather) {
      commands.push({ type: 'setWeather', mode: plan.weather });
      setVisibleWeather(plan.weather);
    }
    applyVisible(commands);
    activePreset = id;
  };
  const flyToFacility = (id: FacilityId): void => {
    // Fly there without selecting a bay (Q2); clearing the selection also stops any follow.
    const f = FACILITIES.find((x) => x.id === id);
    const b = f ? hub.buildings.find((x) => x.id === f.building) : undefined;
    if (!f || !b) return;
    store.clearSelection();
    rig.glideTo({ x: b.x, z: b.z }, f.distance);
  };

  const onArea = (id: AreaId): void => {
    // Switching area deselects, so "following ⇔ selected" stays true (architecture §14.1).
    store.clearSelection();
    store.setArea(id);
    const a = areaById(id);
    rig.glideTo({ x: a.x, z: a.z }, a.distance, a.azimuth ?? (id === 'overview' ? Math.PI / 4 : undefined));
  };

  render(
    h(Dashboard, {
      store,
      data,
      tables,
      settings,
      unitIds: world.unitIds,
      throughput,
      clockAt,
      onArea,
      onWeather: (mode: WeatherMode) => {
        // A manual choice goes to both simulations, and wins over a preset's weather (W8).
        weatherMemory.onManualWeather();
        baseline.apply({ type: 'setWeather', mode });
        weatherMode = mode;
        sim.apply({ type: 'setWeather', mode });
        settings.value = { ...settings.value, weather: mode };
      },
      onDayNight: (value: DayNight) => {
        dayNight = value;
        settings.value = { ...settings.value, dayNight: value };
      },
      onTheme: (t: Theme) => {
        theme = t;
        saveTheme(storage, t);
        document.documentElement.dataset.theme = t;
        atmosphere.setPalette(paletteFor(t));
        settings.value = { ...settings.value, theme: t };
      },
      onOpenAlerts: () => {
        alertFeed.markAllRead();
        data.value = dashboardData();
      },
      onPick: (r) => {
        store.select({ kind: r.kind, id: r.id });
      },
      onSelectVehicle: (id: string) => {
        store.select({ kind: 'agent', id });
      },
      // Stage 3 placeholders (M9, FE-18…FE-20).
      audio: { onSound: notImplemented, onVolume: notImplemented, onToasts: notImplemented, onToast: notImplemented, onDismissToast: notImplemented, onHoldToast: notImplemented },
      onLabels: (on: boolean) => {
        saveFlag(storage, LABELS_KEY, on);
        settings.value = { ...settings.value, labels: on };
        data.value = dashboardData();
      },
      onPlace: (id: PlaceId) => {
        const anchor = airportPlan().labels.find((l) => l.id === id);
        const place = PLACES.find((p) => p.id === id);
        if (!anchor || !place) return;
        store.clearSelection();
        rig.glideTo({ x: anchor.x, z: anchor.z }, place.distance);
      },
      onFacility: flyToFacility,
      onSelectUnit: (id: string) => {
        store.select({ kind: 'resource', id });
      },
      share,
      shareActions,
      scenario: {
        outages,
        offlineReason: (unitId: string) => offlineReason(curr.scenario, unitId),
        isOutageable,
        onSurge: () => {
          scenarioCommand({ type: 'surge' });
        },
        onCrew: (station, level) => {
          scenarioCommand({ type: 'setCrew', station, level });
        },
        onSetOnline: (unitId, online) => {
          scenarioCommand({ type: 'setUnitOnline', unitId, online });
        },
        onPreset: applyPreset,
        onReset: () => {
          activePreset = null;
          const restore = weatherMemory.takeRestore();
          const commands: Command[] = [{ type: 'resetScenario' }];
          if (restore) {
            commands.push({ type: 'setWeather', mode: restore });
            setVisibleWeather(restore);
          }
          applyVisible(commands);
        },
        onSpeed: (value) => {
          setSpeed(value);
        },
      },
    }),
    uiRoot,
  );

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
    data.value = dashboardData();
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
  // Keys from SHORTCUTS (J9): Esc leaves the tour, then closes a dialog, then clears the selection.
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!SHORTCUTS.some((s) => s.key === key)) return;
    if (key === 'Escape') {
      if (kiosk) exitKiosk();
      else if (share.value.helpOpen) patchShare({ helpOpen: false });
      else if (share.value.copyFallback !== null) patchShare({ copyFallback: null });
      else store.clearSelection();
    } else if (key === 'p') {
      e.preventDefault();
      captureRequested = true;
    } else if (key === '?') {
      e.preventDefault();
      patchShare({ helpOpen: true });
    }
  });
  window.addEventListener('resize', resize);

  // ---------- building labels (I-1, I-4) ----------

  const labelAnchors = new Map<string, { x: number; y: number; z: number; priority: number }>(
    FACILITIES.flatMap((f) => {
      const b = hub.buildings.find((x) => x.id === f.building);
      return b ? [[f.id, { x: b.x, y: f.labelY, z: b.z, priority: f.priority }] as const] : [];
    }),
  );
  // Airport places share the overlay, below every hub facility (L-1).
  for (const l of airportPlan().labels) {
    const p = PLACES.find((x) => x.id === l.id);
    if (p) labelAnchors.set(l.id, { x: l.x, y: l.y, z: l.z, priority: p.priority });
  }
  let shownLabels: ReadonlySet<string> = new Set();
  /** Positions every label over its building, then hides the lower-priority ones that overlap. */
  const placeLabels = (): void => {
    const els = overlay.querySelectorAll<HTMLElement>('[data-facility], [data-place]');
    if (els.length === 0) {
      shownLabels = new Set();
      return;
    }
    const rects: { id: string; priority: number; x: number; y: number; w: number; h: number; el: HTMLElement }[] = [];
    for (const el of els) {
      const id = el.dataset.facility ?? el.dataset.place ?? '';
      const a = labelAnchors.get(id);
      const p = a ? toScreen(a.x, a.y, a.z) : null;
      if (!a || !p) {
        el.style.visibility = 'hidden';
        continue;
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = p.x - w / 2;
      const y = p.y - h;
      el.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px)`;
      rects.push({ id, priority: a.priority, x, y, w, h, el });
    }
    // Labels never show through the dashboard panels.
    const blockers = [...overlay.querySelectorAll<HTMLElement>('.dashboard .panel, .sheet-detail, .sheet-tracker, .sheet-table, .embed-hud, .kiosk-caption')]
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0)
      .map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height }));
    shownLabels = declutter(rects, blockers);
    for (const r of rects) r.el.style.visibility = shownLabels.has(r.id) ? 'visible' : 'hidden';
  };

  // ---------- loop (A3) ----------

  let accumulator = createAccumulator(rates.stepWallSec, 5);
  /** Airport clock (H2): advances with the simulation speed; frozen while paused. */
  let airportTime = 0;
  /** Speed = steps per tick for both simulations (S-19, W9); the step cap grows with it. */
  function setSpeed(value: Speed): void {
    if (value === speed) return;
    speed = value;
    accumulator = createAccumulator(rates.stepWallSec, 5 * Math.max(1, value));
    settings.value = { ...settings.value, speed: value };
  }
  let last = performance.now();
  let panelClock = 0;
  let tableClock = 0;
  let elapsed = 0;
  let ready = false;
  let drawCalls = 0;
  let effects: readonly PostEffect[] = [];
  let lampsLit = 0;
  /** Set by the setQualityTier test hook: stops adaptive tier changes. */
  let pinnedTier: number | null = null;

  const frame = (now: number): void => {
    const rawDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.25, rawDt);
    last = now;
    elapsed += dt;

    const tier = pinnedTier ?? quality.sample(rawDt);
    if (tier !== qualityTier) {
      qualityTier = tier;
      applyQuality(tier);
    }

    const { steps, alpha } = accumulator.push(dt * speed);
    if (steps > 0) {
      // Lockstep: the baseline takes exactly the same steps (S-20).
      for (let i = 0; i < steps; i++) baseline.step();
      baseline.drainEvents();
      for (let i = 0; i < steps - 1; i++) sim.step();
      prev = steps > 1 ? sim.snapshot() : curr;
      sim.step();
      curr = sim.snapshot();
      const events = sim.drainEvents();
      timeline.ingest(events);
      alertFeed.ingest(events);
      checkoutLog.ingest(events);
      throughput.observe(curr.resources, curr.simTimeSec);
    }
    poses = interpolateAgents(prev.agents, curr.agents, alpha);
    agents.update(curr.agents, poses, elapsed);
    const details = detailStates(curr);
    agents.setBeacon(details.towBeacon);

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

    // Camera glides are presentation only: run them on wall-clock time so they land on schedule even
    // when a frame stalls (shader compiles, slow GPUs); the simulation keeps its 0.25 s cap.
    if (kiosk) kioskStep(Math.min(KIOSK_MAX_STEP_SEC, rawDt));
    rig.update(Math.min(1, rawDt));
    environment = environmentFor(weatherMode, curr.clockHours, dayNight, { reducedMotion, qualityTier });
    atmosphere.apply(environment, dt, rig.state().target);
    const q = settingsFor(qualityTier);
    world.update({ dt, wallTime: elapsed, reducedMotion, poolFraction: q.lampPoolFraction, details });
    lampsLit = world.lampsLit();
    // The dome follows the camera sideways so its horizon never comes closer; clouds stay put.
    site.update({
      dt,
      wallTime: elapsed,
      night: environment.nightFactor,
      tier: qualityTier,
      reducedMotion,
      vehicles: curr.agents.flatMap((a) => {
        if (a.kind === 'pedestrian') return [];
        const p = poses.get(a.id);
        return p ? [{ x: p.x, z: p.z, kind: a.kind }] : [];
      }),
    });
    // Visual-only clock: real frame time (capped at 1 s, like the camera) so flights keep pace even
    // when frames are slow; the speed multiplier still pauses and fast-forwards it (H2).
    airportTime += Math.min(1, rawDt) * speed;
    airport.update({ time: airportTime, night: environment.nightFactor, tier: qualityTier, reducedMotion, lampLevel: world.lampsLit() });
    placeLabels();
    sky.group.position.set(camera.position.x, 0, camera.position.z);
    sky.update(skyColours(environment, weatherMode), q.clouds, reducedMotion ? 0 : dt);

    renderer.info.reset();
    effects = postEffectsFor({ nightFactor: environment.nightFactor, qualityTier, shimmer: environment.shimmer });
    post.render(effects, elapsed);
    drawCalls = renderer.info.render.calls;
    // Same task as the render, so the drawing buffer still holds this frame (J7).
    if (captureRequested) {
      captureRequested = false;
      takeScreenshot();
    }

    panelClock += dt;
    tableClock += dt;
    if (panelClock >= PANEL_REFRESH_SEC) {
      panelClock = 0;
      kpis.observe(sim.metrics(), curr.simTimeSec);
      alertFeed.observeSnapshot(curr, rates.evStageSocPct);
      baselineMetrics = baseline.metrics();
      baselineQueues = queueSummary(baseline.snapshot());
      data.value = dashboardData();
      if (mode === 'kiosk') patchShare({ kiosk: kioskView() });
      else if (mode === 'embed') patchShare({ fullViewHref: fullViewHref() });
    }
    if (tableClock >= TABLE_REFRESH_SEC) {
      tableClock = 0;
      tables.value = tableData();
    }
    ready = true;
    requestAnimationFrame(frame);
  };

  // Deep link, in J2 order (seed, weather, time of day, theme and labels were applied above).
  if (link.quality !== 'auto') {
    pinnedTier = link.quality;
    qualityTier = link.quality;
    applyQuality(link.quality);
  }
  if (link.preset) applyPreset(link.preset);
  if (link.area !== LINK_DEFAULTS.area) {
    const a = areaById(link.area);
    store.setArea(link.area);
    rig.jump({ target: { x: a.x, z: a.z }, distance: a.distance, azimuth: a.azimuth ?? Math.PI / 4, polar: 0.85 });
  }
  const facilityLink = FACILITIES.find((f) => f.id === link.select);
  if (facilityLink) flyToFacility(facilityLink.id);
  else if (link.select) store.select({ kind: 'resource', id: link.select });
  else if (link.cam) {
    const c = link.cam;
    rig.jump({ target: { x: c.x, z: c.z }, distance: c.distance, azimuth: c.azimuthDeg / DEG, polar: (90 - c.elevationDeg) / DEG });
  }
  setSpeed(toSpeed(link.speed));
  if (mode === 'kiosk') enterKiosk();
  else if (mode === 'embed') patchShare({ fullViewHref: fullViewHref() });

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
      weather: () => curr.weather,
      environment: () => environment,
      theme: () => theme,
      qualityTier: () => qualityTier,
      postEffects: () => effects,
      lampsLit: () => lampsLit,
      setQualityTier(tier: number) {
        pinnedTier = tier;
        qualityTier = tier;
        applyQuality(tier);
      },
      scenario: () => curr.scenario,
      baselineMetrics: () => baseline.metrics(),
      applyScenario: scenarioCommand,
      setSpeed(value) {
        if (value === 0 || value === 1 || value === 2 || value === 3) setSpeed(value);
      },
      simTimes: () => ({ visible: sim.snapshot().simTimeSec, baseline: baseline.snapshot().simTimeSec }),
      facilityLabels: () => {
        if (!settings.value.labels) return [];
        return facilityStatuses(curr).map((s: FacilityStatus) => {
          const el = overlay.querySelector<HTMLElement>(`[data-facility="${s.id}"]`);
          return { id: s.id, text: el?.textContent ?? '', state: s.state, visible: shownLabels.has(s.id) };
        });
      },
      placeLabels: () =>
        settings.value.labels
          ? PLACES.map((p) => {
              const el = overlay.querySelector<HTMLElement>(`[data-place="${p.id}"]`);
              return { id: p.id, text: el?.textContent ?? '', visible: shownLabels.has(p.id) };
            })
          : [],
      aircraft: () => airport.aircraft().map((a) => ({ id: a.id, phase: a.phase, x: a.x, y: a.y, z: a.z, gate: a.gate })),
      airportTime: () => airportTime,
      boomOpen: (id) => site.boomOpen(id),
      patrolPose: () => site.patrolPose(),
      mode: () => mode,
      link: currentLink,
      kiosk: () => {
        if (!kiosk) return null;
        const k = kiosk.state();
        return { phase: k.phase, area: k.area, resumeInSec: k.resumeInSec };
      },
      advanceKiosk: kioskStep,
      help: () => share.value.helpOpen,
      // Stage 3 placeholders (M9, §22).
      audioState: notImplemented,
      toasts: notImplemented,
      revenue: () => sim.metrics().revenue,
      wind: () => environment.wind,
      lightning: notImplemented,
      particleCount: notImplemented,
      forceAlert: notImplemented,
    };
    window.__hub = hooks;
  }
}

const root = document.getElementById('app');
if (root) {
  if (hasWebGL2(document)) start(root);
  else showFallback(root);
}
