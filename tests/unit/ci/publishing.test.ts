import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Requirements SH-1, SH-2, SH-13, SH-14; architecture §21 J11. The workflows are proven for real on
// the first push; these tests pin their shape and order.

const read = (path: string): string => (existsSync(resolve(path)) ? readFileSync(resolve(path), 'utf8') : '');
/** Index of each needle in order; -1 if missing. */
const positions = (text: string, needles: readonly string[]): number[] => needles.map((n) => text.indexOf(n));

describe('Pages workflow (SH-1)', () => {
  const yml = read('.github/workflows/pages.yml');

  it('runs on pushes to main and by hand', () => {
    expect(yml).toMatch(/on:\s*\n\s+push:\s*\n\s+branches:\s*\[\s*main\s*\]/);
    expect(yml).toContain('workflow_dispatch');
  });

  it('checks, runs E2E, builds for production, then deploys — in that order', () => {
    const order = positions(yml, ['npm ci', 'playwright install --with-deps chromium', 'npm run check', 'npm run test:e2e', 'npm run build', 'actions/upload-pages-artifact', 'actions/deploy-pages']);
    for (const p of order) expect(p).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('uses least privilege and one deploy at a time', () => {
    expect(yml).toMatch(/permissions:\s*\n\s+contents:\s*read\s*\n\s+pages:\s*write\s*\n\s+id-token:\s*write/);
    expect(yml).toMatch(/concurrency:\s*\n\s+group:\s*pages/);
    expect(yml).toContain('path: dist');
    expect(yml).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
  });
});

describe('Release workflow (SH-2)', () => {
  const yml = read('.github/workflows/release.yml');

  it('runs on version tags', () => {
    expect(yml).toMatch(/on:\s*\n\s+push:\s*\n\s+tags:\s*\[\s*'v\*\.\*\.\*'\s*\]/);
  });

  it('checks the tag against package.json before building', () => {
    const order = positions(yml, ['GITHUB_REF_NAME', 'npm run check', 'npm run test:e2e', 'npm run build', 'gh release create']);
    for (const p of order) expect(p).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(yml).toContain("require('./package.json').version");
  });

  it('attaches goldlane-hub-<version>.html with notes from the CHANGELOG', () => {
    expect(yml).toMatch(/goldlane-hub-\$\{?\{?\s*(env\.)?VERSION/i);
    expect(yml).toContain('scripts/changelog-section.mjs');
    expect(yml).toMatch(/permissions:\s*\n\s+contents:\s*write/);
  });
});

describe('CHANGELOG and release notes (SH-14)', () => {
  const log = read('CHANGELOG.md');

  it('has one entry per milestone, newest first', () => {
    const versions = [...log.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)].map((m) => m[1]);
    expect(versions).toEqual(['0.8.0', '0.7.0', '0.6.0', '0.5.0', '0.4.0', '0.3.0', '0.2.0', '0.1.0']);
  });

  it('prints one version section for the release notes', () => {
    const out = execFileSync(process.execPath, ['scripts/changelog-section.mjs', '0.7.0'], { encoding: 'utf8' });
    expect(out.trim().startsWith('## [0.7.0]')).toBe(true);
    expect(out).not.toContain('## [0.6.0]');
    expect(out).not.toContain('## [0.8.0]');
  });

  it('fails for a version that is not in the CHANGELOG', () => {
    expect(() => execFileSync(process.execPath, ['scripts/changelog-section.mjs', '9.9.9'], { encoding: 'utf8', stdio: 'pipe' })).toThrow();
  });
});

describe('README (SH-13)', () => {
  const readme = read('README.md');

  it('documents running, testing, deep links, embedding, kiosk and the licence', () => {
    for (const s of ['npm ci', 'npm run dev', 'npm run check', 'npm run test:soak', 'npm run test:e2e', '<iframe', '?kiosk=1', 'MIT', 'fictional']) {
      expect(readme, s).toContain(s);
    }
    for (const key of ['area', 'cam', 'weather', 'tod', 'speed', 'labels', 'theme', 'quality', 'seed', 'preset', 'select', 'kiosk', 'embed']) {
      expect(readme, key).toMatch(new RegExp(`\\| \`${key}\` \\|`));
    }
  });

  it('shows screenshots that exist', () => {
    const images = [...readme.matchAll(/!\[[^\]]*\]\((docs\/media\/[^)]+)\)/g)].map((m) => m[1] ?? '');
    expect(images.length).toBeGreaterThanOrEqual(2);
    for (const img of images) expect(existsSync(resolve(img)), img).toBe(true);
  });
});
