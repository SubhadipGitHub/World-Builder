import { notImplemented } from '../shared/notImplemented';
import type { ThemeStorage } from './theme';

// Remembered on/off settings (architecture §18, G9), like the theme (X-4).

export const LABELS_KEY = 'goldlane.labels';

/** The saved flag ('1' / '0'), or `fallback` if none, invalid, or storage throws. Never throws. */
export function loadFlag(storage: ThemeStorage | null, key: string, fallback: boolean): boolean {
  return notImplemented(storage, key, fallback);
}

/** Saves the flag; failures are ignored. Never throws. */
export function saveFlag(storage: ThemeStorage | null, key: string, value: boolean): void {
  notImplemented(storage, key, value);
}
