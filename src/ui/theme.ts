import { notImplemented } from '../shared/notImplemented';

export type Theme = 'dark' | 'light';

/** Minimal Storage surface (injectable for tests). Any call may throw (blocked storage). */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const THEME_KEY = 'goldlane.theme';

/** The saved theme, or 'dark' (D6) if none, invalid, or storage throws (X-4). Never throws. */
export function loadTheme(storage: ThemeStorage | null): Theme {
  return notImplemented(storage);
}

/** Saves the theme; failures are ignored. Never throws. */
export function saveTheme(storage: ThemeStorage | null, theme: Theme): void {
  notImplemented(storage, theme);
}
