import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// M3 premium visuals end to end (requirements §8, architecture §16), against the test build.
const URL = pathToFileURL(resolve('dist/index.html')).href;

async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: 20_000 });
}

const timeOfDay = (page: Page, label: 'Day' | 'Night') =>
  page.getByRole('group', { name: 'Time of day' }).getByRole('button', { name: label }).click();

test('street lights switch on at night and off by day (V-6)', async ({ page }) => {
  await open(page);
  await expect.poll(() => page.evaluate(() => window.__hub!.lampsLit())).toBe(0);
  await timeOfDay(page, 'Night');
  await expect.poll(() => page.evaluate(() => window.__hub!.lampsLit()), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await timeOfDay(page, 'Day');
  await expect.poll(() => page.evaluate(() => window.__hub!.lampsLit()), { timeout: 20_000 }).toBe(0);
});

test('lamps come on one by one, not all at once (V-6)', async ({ page }) => {
  await open(page);
  await timeOfDay(page, 'Night');
  const early = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        setTimeout(() => {
          done(window.__hub!.lampsLit());
        }, 1_200);
      }),
  );
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(1);
});

test('night blooms on the top tier within the draw-call budget (V-7, §8.3)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__hub!.setQualityTier(0);
  });
  await timeOfDay(page, 'Night');
  await expect.poll(() => page.evaluate(() => window.__hub!.postEffects())).toContain('bloom');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(300);
  await timeOfDay(page, 'Day');
  await expect.poll(() => page.evaluate(() => window.__hub!.postEffects())).not.toContain('bloom');
});

test('the lowest tier skips bloom and stays within 150 draw calls at night in the rain (§8.3)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__hub!.setQualityTier(2);
  });
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('rain');
  await timeOfDay(page, 'Night');
  await expect.poll(() => page.evaluate(() => window.__hub!.environment().nightFactor)).toBe(1);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hub!.postEffects())).not.toContain('bloom');
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(150);
});

test('the premium world loads without errors (V-1..V-9)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await open(page);
  await timeOfDay(page, 'Night');
  await page.waitForTimeout(1_000);
  expect(errors).toEqual([]);
});
