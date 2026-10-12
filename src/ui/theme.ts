export type Theme = 'dark' | 'light';

/** Minimal Storage surface (injectable for tests). Any call may throw (blocked storage). */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const THEME_KEY = 'goldlane.theme';

/** The saved theme, or 'dark' (D6) if none, invalid, or storage throws (X-4). Never throws. */
export function loadTheme(storage: ThemeStorage | null): Theme {
  try {
    return storage?.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Saves the theme; failures are ignored. Never throws. */
export function saveTheme(storage: ThemeStorage | null, theme: Theme): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice simply isn't remembered.
  }
}
