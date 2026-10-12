import type { ScenarioCommand, ScenarioView } from '../sim/scenario';
import type { Metrics } from '../sim/world';
import type { WeatherMode } from '../config/weather';
import type { AreaId } from '../layout/hub';
import type { Environment } from '../render/environment';
import type { Vec2 } from '../sim/types';
import type { Theme } from '../ui/theme';

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
}

declare global {
  interface Window {
    __hub?: HubTestHooks;
  }
}
