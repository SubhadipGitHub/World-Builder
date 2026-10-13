import { notImplemented } from '../shared/notImplemented';
import type { ThemeStorage } from './theme';

// Remembered on/off settings (architecture §18, G9), like the theme (X-4).

export const LABELS_KEY = 'goldlane.labels';
/** M9 (FE-18, FE-20). */
export const SOUND_KEY = 'goldlane.sound';
export const VOLUME_KEY = 'goldlane.volume';
export const TOASTS_KEY = 'goldlane.toasts';
export const DEFAULT_VOLUME = 60;

/** The saved flag ('1' / '0'), or `fallback` if none, invalid, or storage throws. Never throws. */
export function loadFlag(storage: ThemeStorage | null, key: string, fallback: boolean): boolean {
  try {
    const v = storage?.getItem(key);
    return v === '1' ? true : v === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}

/** Saves the flag; failures are ignored. Never throws. */
export function saveFlag(storage: ThemeStorage | null, key: string, value: boolean): void {
  try {
    storage?.setItem(key, value ? '1' : '0');
  } catch {
    // Private mode or blocked storage: the choice simply isn't remembered.
  }
}

/** A saved whole number clamped to [min, max], or `fallback` if none, invalid, or storage throws. Never throws. */
export function loadNumber(storage: ThemeStorage | null, key: string, fallback: number, min: number, max: number): number {
  return notImplemented(storage, key, fallback, min, max);
}

/** Saves a number; failures are ignored. Never throws. */
export function saveNumber(storage: ThemeStorage | null, key: string, value: number): void {
  notImplemented(storage, key, value);
}
