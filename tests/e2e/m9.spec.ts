import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// M9 fleet economics, sound, weather FX and notifications end to end (requirements §14, architecture §22).
const URL = pathToFileURL(resolve('dist/index.html')).href;
const READY_MS = 60_000;

const errors: string[] = [];
const remoteRequests: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  remoteRequests.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) remoteRequests.push(r.url());
  });
});

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(URL + query);
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: READY_MS });
}

test('the revenue card shows today’s revenue and grows as cars leave (FE-8)', async ({ page }) => {
  await open(page, '?speed=45');
  const card = page.getByRole('region', { name: 'Key metrics' });
  await expect(card).toContainText('Revenue today');
  await expect(card).toContainText(/\$\d/);
  const r0 = await page.evaluate(() => window.__hub!.revenue().total);
  await expect.poll(() => page.evaluate(() => window.__hub!.revenue().total), { timeout: 60_000 }).toBeGreaterThan(r0);
  expect(errors).toEqual([]);
});

test('sound stays off until the speaker is clicked, then runs with no requests and the CSP unchanged (FE-16, FE-18)', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => window.__hub!.audioState())).toBeNull();
  const speaker = page.getByRole('button', { name: 'Sound' });
  await expect(speaker).toHaveAttribute('aria-pressed', 'false');
  await speaker.click();
  await expect(speaker).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__hub!.audioState()?.running ?? false)).toBe(true);
  // Remembered per browser.
  expect(await page.evaluate(() => localStorage.getItem('goldlane.sound'))).toBe('1');
  // M mutes again.
  await page.locator('canvas').first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('m');
  await expect(speaker).toHaveAttribute('aria-pressed', 'false');
  expect(remoteRequests).toEqual([]);
  const html = readFileSync(resolve('dist/index.html'), 'utf8');
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1]?.replaceAll('&#39;', "'");
  // M10 (M10-7) adds 'wasm-unsafe-eval' for the model decoder; sound itself needs no CSP change.
  expect(csp).toBe("default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:");
  expect(errors).toEqual([]);
});

test('a warning pops up as a toast that selects its car when clicked (FE-19)', async ({ page }) => {
  await open(page);
  const id = await page.evaluate(() => window.__hub!.forceAlert('warning'));
  const toast = page.getByRole('status').getByRole('button', { name: new RegExp(id) });
  await expect(toast).toBeVisible();
  await toast.click();
  await expect.poll(() => page.evaluate(() => window.__hub!.selection())).toBe(id);
  expect(errors).toEqual([]);
});

test('"Pop-up alerts" off keeps toasts away, and the choice is remembered (FE-20)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('switch', { name: 'Pop-up alerts' }).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hub!.forceAlert('critical'));
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.__hub!.toasts())).visible).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('goldlane.toasts'))).toBe('0');
});

test('a thunderstorm at night strikes lightning within 30 s and stays in the draw-call budget (FE-12, §14.7)', async ({ page }) => {
  await open(page, '?weather=storm&tod=night&quality=0');
  await expect.poll(() => page.evaluate(() => window.__hub!.lightning().strikes), { timeout: 30_000 }).toBeGreaterThan(0);
  const env = await page.evaluate(() => window.__hub!.environment());
  expect(env).toMatchObject({ storm: true, rain: true });
  expect((await page.evaluate(() => window.__hub!.wind())).strength).toBeGreaterThan(0.5);
  await expect.poll(() => page.evaluate(() => window.__hub!.particleCount())).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(300);
  expect(errors).toEqual([]);
});

test('tier 2 keeps the M9 world within 150 draw calls, with no particles (FE-15, §14.7)', async ({ page }) => {
  await open(page, '?weather=storm&tod=night&quality=2');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__hub!.particleCount())).toBe(0);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(150);
});

test('fog thickens the air and turns the headlights on by day (FE-11)', async ({ page }) => {
  await open(page, '?tod=day');
  const clear = await page.evaluate(() => window.__hub!.environment().fogDensity);
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('fog');
  await expect.poll(() => page.evaluate(() => window.__hub!.environment().fog)).toBe(true);
  const env = await page.evaluate(() => window.__hub!.environment());
  expect(env.fogDensity).toBeGreaterThan(clear);
  expect(env.headlightsByDay).toBe(true);
  expect(await page.evaluate(() => window.__hub!.weather())).toBe('fog');
});

test('the weather menu lists six modes (FE-6)', async ({ page }) => {
  await open(page);
  const options = await page.getByRole('combobox', { name: 'Weather' }).locator('option').allTextContents();
  expect(options).toEqual(['Clear / sunny', 'Overcast', 'Fog', 'Heavy rain / slick', 'Thunderstorm', 'Heatwave / high demand']);
});
