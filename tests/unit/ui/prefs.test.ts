import { describe, expect, it } from 'vitest';
import { LABELS_KEY, loadFlag, saveFlag } from '../../../src/ui/prefs';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
const broken = { getItem: (): string | null => { throw new Error('blocked'); }, setItem: (): void => { throw new Error('blocked'); } };

describe('loadFlag / saveFlag (G9, I-4)', () => {
  it('round-trips a flag', () => {
    const s = memory();
    saveFlag(s, LABELS_KEY, false);
    expect(s.data.get(LABELS_KEY)).toBe('0');
    expect(loadFlag(s, LABELS_KEY, true)).toBe(false);
    saveFlag(s, LABELS_KEY, true);
    expect(loadFlag(s, LABELS_KEY, false)).toBe(true);
  });

  it('falls back when missing, invalid, unavailable or throwing', () => {
    expect(loadFlag(memory(), LABELS_KEY, true)).toBe(true);
    const s = memory();
    s.setItem(LABELS_KEY, 'maybe');
    expect(loadFlag(s, LABELS_KEY, true)).toBe(true);
    expect(loadFlag(null, LABELS_KEY, false)).toBe(false);
    expect(loadFlag(broken, LABELS_KEY, true)).toBe(true);
    expect(() => {
      saveFlag(broken, LABELS_KEY, true);
    }).not.toThrow();
  });
});
