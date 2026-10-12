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
}

declare global {
  interface Window {
    __hub?: HubTestHooks;
  }
}
