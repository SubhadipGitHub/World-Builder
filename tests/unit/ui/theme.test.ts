import { describe, expect, it, vi } from 'vitest';
import { loadTheme, saveTheme, THEME_KEY, type ThemeStorage } from '../../../src/ui/theme';

const memory = (initial: Record<string, string> = {}): ThemeStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
};
const broken: ThemeStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('theme persistence (X-4)', () => {
  it('defaults to dark when nothing valid is saved', () => {
    expect(loadTheme(null)).toBe('dark');
    expect(loadTheme(memory())).toBe('dark');
    expect(loadTheme(memory({ [THEME_KEY]: 'purple' }))).toBe('dark');
    expect(loadTheme(broken)).toBe('dark');
  });

  it('round-trips the saved theme', () => {
    const s = memory();
    saveTheme(s, 'light');
    expect(s.data[THEME_KEY]).toBe('light');
    expect(loadTheme(s)).toBe('light');
  });

  it('never throws when storage is missing or blocked', () => {
    expect(() => {
      saveTheme(null, 'light');
    }).not.toThrow();
    expect(() => {
      saveTheme(broken, 'light');
    }).not.toThrow();
    const spy = vi.fn();
    saveTheme({ getItem: () => null, setItem: spy }, 'dark');
    expect(spy).toHaveBeenCalledWith(THEME_KEY, 'dark');
  });
});
