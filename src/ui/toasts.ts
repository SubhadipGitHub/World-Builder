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

interface Entry {
  toast: Toast;
  readonly key: string;
  /** When the merge window for this toast started (its first alert). */
  readonly firstAt: number;
  /** Time left on screen, counted down only while visible and not held. */
  remainingMs: number;
  /** Last tick time while counting; null while held. */
  since: number | null;
}

const lifetime = (s: Toast['severity']): number => (s === 'critical' ? CRITICAL_TOAST_MS : WARNING_TOAST_MS);

export function createToastStore(opts: { readonly maxVisible?: number } = {}): ToastStore {
  const max = opts.maxVisible ?? MAX_VISIBLE_TOASTS;
  /** Newest first. */
  let entries: Entry[] = [];
  let enabled = true;
  let counter = 0;

  const isVisible = (e: Entry): boolean => entries.indexOf(e) < max;
  /** Brings every visible toast's clock up to `now`; waiting ones don't count down. */
  const advance = (now: number): void => {
    for (const e of entries) {
      if (e.since === null) continue;
      if (isVisible(e)) e.remainingMs -= Math.max(0, now - e.since);
      e.since = now;
    }
  };

  return {
    ingest(alerts, now) {
      if (!enabled) return [];
      advance(now);
      const shown: Toast[] = [];
      for (const a of alerts) {
        if (a.severity === 'info') continue;
        const key = `${a.kind}:${a.unitId ?? a.vehicleId ?? a.message}`;
        const existing = entries.find((e) => e.key === key && now - e.firstAt <= MERGE_WINDOW_MS);
        if (existing) {
          existing.toast = { ...existing.toast, alertId: a.id, severity: a.severity, message: a.message, count: existing.toast.count + 1 };
          existing.remainingMs = lifetime(a.severity);
          entries = [existing, ...entries.filter((e) => e !== existing)];
          shown.push(existing.toast);
          continue;
        }
        const toast: Toast = { id: `toast-${String(++counter)}`, alertId: a.id, severity: a.severity, message: a.message, count: 1, vehicleId: a.vehicleId, unitId: a.unitId };
        entries.unshift({ toast, key, firstAt: now, remainingMs: lifetime(a.severity), since: now });
        shown.push(toast);
      }
      return shown;
    },
    tick(now) {
      advance(now);
      entries = entries.filter((e) => e.remainingMs > 0);
    },
    hold(id, on, now) {
      advance(now);
      const e = entries.find((x) => x.toast.id === id);
      if (e) e.since = on ? null : now;
    },
    dismiss(id) {
      entries = entries.filter((e) => e.toast.id !== id);
    },
    visible: () => entries.slice(0, max).map((e) => e.toast),
    overflow: () => Math.max(0, entries.length - max),
    setEnabled(on) {
      enabled = on;
      if (!on) entries = [];
    },
  };
}
