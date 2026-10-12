import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// M2 blocks 4–5 end to end, against the built single file (vite build --mode test).
const URL = pathToFileURL(resolve('dist/index.html')).href;

async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: 20_000 });
}

test('panels are frosted glass (D-1)', async ({ page }) => {
  await open(page);
  const blur = await page.getByRole('banner').evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(blur).toContain('blur');
});

test('KPI cards show live values (D-3)', async ({ page }) => {
  await open(page);
  const region = page.getByRole('region', { name: 'Key metrics' });
  await expect(region.getByRole('heading')).toHaveText(['Turnaround time', 'Fleet utilisation', 'EV state of charge']);
  await expect(region.getByText(/^\d+%$/).first()).toBeVisible();
});

test('search picks a vehicle, selects it and the tracker follows (D-2, D-5)', async ({ page }) => {
  await open(page);
  const box = page.getByRole('combobox', { name: 'Search vehicles, plates, agreements or bays' });
  await box.fill('GL-PGW');
  const first = page.getByRole('listbox').getByRole('option').first();
  await expect(first).toBeVisible();
  const id = ((await first.textContent()) ?? '').match(/GL-PGW-\d{5}/)?.[0];
  expect(id).toBeTruthy();
  await box.press('ArrowDown');
  await box.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__hub!.selection())).toBe(id);
  await expect(page.getByRole('region', { name: 'Process tracker' }).getByRole('heading')).toHaveText(`Process tracker · ${id!}`);
});

test('clicking a live table row selects that vehicle (D-6)', async ({ page }) => {
  await open(page);
  const panel = page.getByRole('region', { name: 'Live table' }).getByRole('tabpanel');
  const row = panel.getByRole('row').nth(1);
  const id = ((await row.textContent()) ?? '').match(/GL-PGW-\d{5}/)?.[0];
  expect(id).toBeTruthy();
  await row.click();
  await expect.poll(() => page.evaluate(() => window.__hub!.selection())).toBe(id);
});

test('weather changes both the simulation and the scene (X-1)', async ({ page }) => {
  await open(page);
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('rain');
  await expect.poll(() => page.evaluate(() => window.__hub!.weather())).toBe('rain');
  await expect.poll(() => page.evaluate(() => window.__hub!.environment())).toMatchObject({ rain: true, wetness: 1 });
});

test('night mode darkens the hub and stays within the draw-call budget in the rain (X-2, N-2)', async ({ page }) => {
  await open(page);
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('rain');
  await page.getByRole('group', { name: 'Time of day' }).getByRole('button', { name: 'Night' }).click();
  await expect.poll(() => page.evaluate(() => window.__hub!.environment().nightFactor)).toBe(1);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(300);
});

test('the light theme applies and survives a reload (X-4)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('switch', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => window.__hub!.theme())).toBe('light');
  await page.reload();
  await page.waitForFunction(() => window.__hub?.ready === true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('reduced motion turns off heat shimmer (N-5)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('heatwave');
  await expect.poll(() => page.evaluate(() => window.__hub!.environment())).toMatchObject({ heat: true, shimmer: false });
});

test.describe('on a phone (X-3)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('fits the screen and moves panels into a bottom sheet', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByTestId('bottom-sheet')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    expect(await page.evaluate(() => window.__hub!.qualityTier())).toBeGreaterThanOrEqual(1);
  });
});
