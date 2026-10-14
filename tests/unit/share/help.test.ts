import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUICK_HELP, SHORTCUTS } from '../../../src/share/help';
import { APP_VERSION, BUILD_DATE } from '../../../src/share/version';

// Requirements SH-3, SH-12, SH-12a; architecture §21 J9, J10, J12.

describe('shortcuts (SH-12, J9)', () => {
  it('lists the pointer controls and the M8 keys', () => {
    const keys = SHORTCUTS.map((s) => s.keys);
    for (const k of ['Drag', 'Right-drag', 'Wheel', 'Click', 'Esc', 'P', '?']) expect(keys).toContain(k);
  });

  it('maps P to the screenshot, ? to help and Esc to closing or leaving', () => {
    const byKey = new Map(SHORTCUTS.filter((s) => s.key).map((s) => [s.key, s.action]));
    expect(byKey.get('p')).toMatch(/screenshot/i);
    expect(byKey.get('?')).toMatch(/help/i);
    expect(byKey.get('Escape')).toMatch(/tour|close|clear/i);
  });

  it('lists M for sound (FE-18)', () => {
    const m = SHORTCUTS.find((s) => s.key === 'm');
    expect(m?.keys).toBe('M');
    expect(m?.action).toMatch(/sound/i);
  });

  it('every handled key is listed once', () => {
    const handled = SHORTCUTS.flatMap((s) => (s.key ? [s.key] : []));
    expect(new Set(handled).size).toBe(handled.length);
  });

  it('quick help is the first five shortcuts (SH-12a)', () => {
    expect(QUICK_HELP).toEqual(SHORTCUTS.slice(0, 5));
    expect(QUICK_HELP.map((s) => s.keys)).toEqual(['Drag', 'Wheel', 'Area buttons', 'P', '?']);
  });
});

describe('version (SH-3, J12)', () => {
  // M10: 0.10.0 (was 0.9.0).
  it('is package.json version 0.10.0, with an ISO build date', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string };
    expect(pkg.version).toBe('0.10.0');
    expect(APP_VERSION).toBe(pkg.version);
    expect(BUILD_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is MIT licensed (SH-15)', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { license?: string };
    expect(pkg.license).toBe('MIT');
    expect(readFileSync(resolve('LICENSE'), 'utf8')).toMatch(/^MIT License[\s\S]*Copyright \(c\) 2026 Subhadip Dutta/);
  });
});
