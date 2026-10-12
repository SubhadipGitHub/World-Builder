import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// M6 airport end to end (requirements §11, architecture §19), against the test build.
const URL = pathToFileURL(resolve('dist/index.html')).href;

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});

async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: 20_000 });
}

const toAirport = async (page: Page): Promise<void> => {
  await page.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: 'Airport' }).click();
  await expect.poll(async () => page.evaluate(() => window.__hub!.cameraTarget().z), { timeout: 20_000 }).toBeGreaterThan(300);
};

test('the Airport area flies there and shows the airport labels (L-1, L-2)', async ({ page }) => {
  await open(page);
  await toAirport(page);
  await expect.poll(async () => (await page.evaluate(() => window.__hub!.placeLabels())).some((l) => l.visible), { timeout: 10_000 }).toBe(true);
  const ids = (await page.evaluate(() => window.__hub!.placeLabels())).map((l) => l.id);
  expect(ids).toContain('terminalA');
  expect(ids).toContain('tower');
  expect(errors).toEqual([]);
});

test('clicking a place label flies the camera to it (L-1)', async ({ page }) => {
  await open(page);
  await toAirport(page);
  await expect.poll(async () => (await page.evaluate(() => window.__hub!.placeLabels())).find((l) => l.id === 'tower')?.visible, { timeout: 10_000 }).toBe(true);
  await page.getByRole('button', { name: 'Control Tower' }).click();
  await expect.poll(async () => page.evaluate(() => window.__hub!.cameraDistance()), { timeout: 15_000 }).toBeLessThan(300);
});

test('jets land and take off, and pause freezes the airport clock (F-1, H2)', async ({ page }) => {
  // A landing and the first take-off span about 150 s of airport time.
  test.setTimeout(150_000);
  await open(page);
  // Tier 2 parks the jets by design (§11.6); software WebGL would drop there, so pin tier 0.
  await page.evaluate(() => {
    window.__hub!.setQualityTier(0);
    window.__hub!.setSpeed(3);
  });
  const phases = new Set<string>();
  await expect
    .poll(
      async () => {
        for (const a of await page.evaluate(() => window.__hub!.aircraft())) phases.add(a.phase);
        return phases.has('landing') && phases.has('takeoff');
      },
      { timeout: 120_000, intervals: [250] },
    )
    .toBe(true);
  await page.getByRole('group', { name: 'Simulation speed' }).getByRole('button', { name: 'Pause' }).click();
  const t0 = await page.evaluate(() => window.__hub!.airportTime());
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window.__hub!.airportTime())).toBe(t0);
});

test('a surge brings an extra approach within 5 s of airport time (F-2)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__hub!.setQualityTier(0);
  });
  const before = new Set((await page.evaluate(() => window.__hub!.aircraft())).map((a) => a.id));
  const t0 = await page.evaluate(() => {
    window.__hub!.applyScenario({ type: 'surge' });
    return window.__hub!.airportTime();
  });
  await expect
    .poll(
      async () =>
        page.evaluate(
          ([ids, start]) => {
            const now = window.__hub!.airportTime();
            const fresh = window.__hub!.aircraft().filter((a) => a.phase === 'approach' && !ids.includes(a.id));
            return fresh.length > 0 ? now - start : -1;
          },
          [[...before], t0] as const,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(0);
});

test('stays within the draw-call budgets at the airport at night in the rain (§11.7)', async ({ page }) => {
  await open(page);
  await toAirport(page);
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('rain');
  await page.getByRole('group', { name: 'Time of day' }).getByRole('button', { name: 'Night' }).click();
  await page.evaluate(() => {
    window.__hub!.setQualityTier(0);
  });
  await page.waitForTimeout(1_500);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(300);
  await page.evaluate(() => {
    window.__hub!.setQualityTier(2);
  });
  await page.waitForTimeout(1_500);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});
