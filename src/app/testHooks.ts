import type { ScenarioCommand, ScenarioView } from '../sim/scenario';
import type { Metrics } from '../sim/world';
import type { WeatherMode } from '../config/weather';
import type { AreaId } from '../layout/hub';
import type { Environment } from '../render/environment';
import type { Vec2 } from '../sim/types';
import type { Theme } from '../ui/theme';
import type { SoundEngineState } from '../audio/engine';
import type { Wind } from '../render/wind';
import type { RevenueView } from '../sim/revenue';
import type { ModelInfo } from '../render/agents';
import type { VehicleClass } from '../sim/types';

/**
 * Test-only window.__hub, present only when built with VITE_TEST_HOOKS=1 (architecture §8).
 * Production builds never include it.
 */
export interface HubTestHooks {
  /** True once the first frame has rendered. */
  readonly ready: boolean;
  /** Ids and kinds of agents currently on the map. */
  agents(): readonly { readonly id: string; readonly kind: string; readonly speed: number }[];
  /** Viewport CSS-pixel position of an agent or unit, or null if off-screen or unknown. */
  screenPosition(id: string): { readonly x: number; readonly y: number } | null;
  /** Selected agent or unit id, or null. */
  selection(): string | null;
  cameraTarget(): Vec2;
  cameraDistance(): number;
  /** The ground point an area switch aims at. */
  areaTarget(id: AreaId): Vec2;
  /** Draw calls in the last frame (N-2 budget). */
  drawCalls(): number;
  /** Current simulation weather (X-1). */
  weather(): WeatherMode;
  /** Lighting and weather parameters applied this frame (X-1, X-2). */
  environment(): Environment;
  theme(): Theme;
  /** Adaptive quality tier, 0 best … 2 lowest (N-2). */
  qualityTier(): number;
  /** Post effects that ran in the last frame, e.g. ['bloom'] (V-7). */
  postEffects(): readonly string[];
  /** Mean brightness of all roadside lamps, 0 off … 1 all fully lit (V-6). */
  lampsLit(): number;
  /** Test only: pins the quality tier (stops adaptive changes). */
  setQualityTier(tier: number): void;
  /** Active what-if levers in the visible simulation (S-17). */
  scenario(): ScenarioView;
  /** Metrics of the shadow baseline simulation (S-11). */
  baselineMetrics(): Metrics;
  /** Sends a scenario command to the visible simulation, as the UI would. */
  applyScenario(command: ScenarioCommand): void;
  /** Sets the simulation speed (0 pause, 1–3). */
  setSpeed(speed: number): void;
  /** Simulated seconds of the visible and the baseline simulation (lockstep check). */
  simTimes(): { readonly visible: number; readonly baseline: number };
  /** Building labels currently shown (I-1): id, text content, state, and whether visible on screen. */
  facilityLabels(): readonly { readonly id: string; readonly text: string; readonly state: string; readonly visible: boolean }[];
  /** Boom arm openness, 0 down … 1 up (SEC-2). */
  boomOpen(id: 'entry' | 'exit'): number;
  /** Patrol car pose, or null when hidden (SEC-4). */
  patrolPose(): { readonly x: number; readonly z: number } | null;
  /** Airport name labels currently shown (L-1). */
  placeLabels(): readonly { readonly id: string; readonly text: string; readonly visible: boolean }[];
  /** Every aircraft at the current airport time (F-1). */
  aircraft(): readonly { readonly id: string; readonly phase: string; readonly x: number; readonly y: number; readonly z: number; readonly gate: string | null }[];
  /** Airport clock (H2): advances with the simulation speed, frozen while paused. */
  airportTime(): number;
  /** M8 (§21): display mode. */
  mode(): 'normal' | 'embed' | 'kiosk';
  /** The link "Copy link" would copy now. */
  link(): string;
  /** Kiosk tour state, or null outside kiosk mode. */
  kiosk(): { readonly phase: 'touring' | 'paused' | 'exited'; readonly area: AreaId; readonly resumeInSec: number | null } | null;
  /** Advances the kiosk tour's wall clock by `sec` (no camera wait). */
  advanceKiosk(sec: number): void;
  /** True while the help dialog is open. */
  help(): boolean;
  /** M9 (§22): the sound engine, or null before sound was first turned on (FE-18). */
  audioState(): SoundEngineState | null;
  /** Visible pop-up alerts, newest first, and how many more are waiting (FE-19). */
  toasts(): { readonly visible: readonly { readonly id: string; readonly severity: string; readonly message: string; readonly count: number }[]; readonly overflow: number };
  /** Revenue of the visible simulation (FE-5), including the running total. */
  revenue(): RevenueView;
  /** Wind applied this frame (FE-13). */
  wind(): Wind;
  /** Lightning since load: strike count, the last strike's schedule time, and the flash applied this frame (FE-12). */
  lightning(): { readonly strikes: number; readonly lastStrikeT: number | null; readonly flash: number };
  /** Live ambient particles (FE-14). */
  particleCount(): number;
  /** Raises a warning or critical maintenance alert for a fleet car on the map, as the simulation would; returns its id. */
  forceAlert(severity: 'warning' | 'critical'): string;
  /** M10 (§23): each fleet class's model source ('blender' or 'procedural') and LOD (BM-13). */
  fleetModels(): Readonly<Record<VehicleClass, ModelInfo>>;
  /** M10: milliseconds from the first frame until every model settled, or null while still loading (§15.6). */
  fleetModelsLoadMs(): number | null;
}

declare global {
  interface Window {
    __hub?: HubTestHooks;
  }
}
