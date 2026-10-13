import { notImplemented } from '../shared/notImplemented';
import type { Alert } from './alerts';

// Pop-up alerts (M9, FE-19, FE-20, architecture F19). Pure: wall-clock milliseconds are passed in.

export const MAX_VISIBLE_TOASTS = 3;
export const WARNING_TOAST_MS = 6_000;
export const CRITICAL_TOAST_MS = 12_000;
/** Repeats of the same kind on the same target within this window merge (×n). */
export const MERGE_WINDOW_MS = 120_000;

export interface Toast {
  readonly id: string;
  /** The alert it was raised for (the latest, after merging). */
  readonly alertId: string;
  readonly severity: 'warning' | 'critical';
  readonly message: string;
  /** Merged repeats, ≥ 1. */
  readonly count: number;
  readonly vehicleId: string | null;
  readonly unitId: string | null;
}

export interface ToastStore {
  /** Takes newly created alerts; returns the toasts newly shown or bumped (for chimes). Info alerts are ignored. */
  ingest(alerts: readonly Alert[], nowMs: number): Toast[];
  /** Expires toasts whose time is up (holds pause the timer). */
  tick(nowMs: number): void;
  /** Pointer over or focus inside a toast pauses its timer. */
  hold(id: string, on: boolean, nowMs: number): void;
  dismiss(id: string): void;
  /** Up to `maxVisible`, newest first. */
  visible(): readonly Toast[];
  /** Toasts waiting beyond the visible ones ("+n more"). */
  overflow(): number;
  /** "Pop-up alerts" switch (FE-20): off clears and ignores new alerts. */
  setEnabled(on: boolean): void;
}

export function createToastStore(opts: { readonly maxVisible?: number } = {}): ToastStore {
  return notImplemented(opts);
}
