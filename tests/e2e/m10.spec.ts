import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

// M10 Blender car models end to end (requirements §15, architecture §23.8).
const URL = pathToFileURL(resolve('dist/index.html')).href;
const READY_MS = 60_000;
const CLASSES = ['economy', 'sedan', 'luxury', 'suv', 'minivan', 'pickup', 'ev'] as const;

const problems: string[] = [];

test.beforeEach(({ page }) => {
  problems.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(e.message));
});

async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: READY_MS });
}

const sources = (page: Page) => page.evaluate(() => window.__hub!.fleetModels());

test('every fleet class swaps to its Blender model at LOD0 soon after load (BM-12, BM-13)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__hub!.setQualityTier(0));
  await expect.poll(async () => Object.values(await sources(page)).every((m) => m.source === 'blender'), { timeout: 2_000 }).toBe(true);
  const info = await sources(page);
  for (const cls of CLASSES) expect(info[cls]).toEqual({ source: 'blender', lod: 0 });
  // §15.6: decoded within 300 ms of the first frame. Software WebGL in CI is slower than a laptop GPU,
  // but decoding is CPU work, so the same limit applies.
  const loadMs = await page.evaluate(() => window.__hub!.fleetModelsLoadMs());
  expect(loadMs).not.toBeNull();
  expect(loadMs).toBeLessThanOrEqual(300);
  expect(problems).toEqual([]);
});

test('tier 2 switches every class to LOD1 and back, within the draw-call budgets (BM-14, §15.6)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__hub!.setQualityTier(0));
  await expect.poll(async () => Object.values(await sources(page)).every((m) => m.source === 'blender'), { timeout: 2_000 }).toBe(true);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(300);

  await page.evaluate(() => window.__hub!.setQualityTier(2));
  await expect.poll(async () => Object.values(await sources(page)).every((m) => m.lod === 1)).toBe(true);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(150);

  await page.evaluate(() => window.__hub!.setQualityTier(1));
  await expect.poll(async () => Object.values(await sources(page)).every((m) => m.lod === 0)).toBe(true);
  expect(problems).toEqual([]);
});

test('the build allows WebAssembly compilation only, and stays within the bundle budget (M10-7, §15.6)', () => {
  const html = readFileSync(resolve('dist/index.html'));
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html.toString())?.[1]?.replaceAll('&#39;', "'");
  expect(csp).toBe("default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(gzipSync(html).length).toBeLessThanOrEqual(600 * 1024);
});
