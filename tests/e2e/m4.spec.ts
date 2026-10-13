import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// M4 what-if scenarios end to end (requirements §9, architecture §17), against the test build.
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

const simTimes = (page: Page) => page.evaluate(() => window.__hub!.simTimes());
const scenario = (page: Page) => page.evaluate(() => window.__hub!.scenario());

test('a preset from the What-if drawer takes effect, shows chips and cones, and resets (S-4..S-7)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'What-if scenarios' }).click();
  const drawer = page.getByRole('dialog', { name: 'What-if scenarios' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Wash tunnel down' }).click();

  await expect.poll(async () => (await scenario(page)).offline).toEqual(['wash1']);
  expect((await scenario(page)).crews.wash).toBe('short');
  const chips = page.getByRole('list', { name: 'Active scenario' });
  await expect(chips.getByRole('button', { name: '1 unit offline' })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Wash: short-staffed' })).toBeVisible();
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(300);

  await drawer.getByRole('button', { name: 'Reset to normal' }).click();
  await expect.poll(async () => (await scenario(page)).active).toBe(false);
  await expect(page.getByRole('list', { name: 'Active scenario' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the baseline runs in lockstep and KPI cards compare against it (S-11, S-12)', async ({ page }) => {
  await open(page);
  const t = await simTimes(page);
  expect(t.visible).toBe(t.baseline);
  await page.evaluate(() => {
    // Fast-forward: software WebGL runs few steps per second, and the early returns trickle in.
    window.__hub!.setSpeed(3);
    window.__hub!.applyScenario({ type: 'surge' });
  });
  await expect(page.getByRole('region', { name: 'Key metrics' }).getByText(/vs normal|≈ normal/).first()).toBeVisible({ timeout: 15_000 });
  // Cars not on the map are out on rent: the surge brings them back early, the baseline doesn't.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const base = window.__hub!.baselineMetrics().counts;
          const onMap = window.__hub!.agents().filter((a) => a.kind === 'fleet').length;
          return base.onRent - (base.total - onMap);
        }),
      { timeout: 40_000 },
    )
    .toBeGreaterThanOrEqual(5);
  const later = await simTimes(page);
  expect(later.visible).toBe(later.baseline);
});

test('a unit can be taken offline from its detail panel; the last one cannot (S-2, S-8)', async ({ page }) => {
  await open(page);
  const search = page.getByRole('combobox', { name: 'Search vehicles, plates, agreements or bays' });
  await search.fill('exit gate 1');
  await page.getByRole('option', { name: /Exit gate 1/ }).click();
  const details = page.getByRole('region', { name: 'Details' });
  await details.getByRole('button', { name: 'Take offline' }).click();
  await expect.poll(async () => (await scenario(page)).offline).toEqual(['gate1']);
  await expect(details.getByText('Offline')).toBeVisible();

  await search.fill('exit gate 2');
  await page.getByRole('option', { name: /Exit gate 2/ }).click();
  await expect(details.getByRole('button', { name: 'Take offline' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('pause freezes the simulation but not the camera; 45× runs about 3× faster than 15× (S-18, S-19, D30)', async ({ page }) => {
  await open(page);
  const speed = page.getByRole('group', { name: 'Simulation speed' });
  await speed.getByRole('button', { name: 'Pause' }).click();
  const paused = await simTimes(page);
  await page.waitForTimeout(1_000);
  expect((await simTimes(page)).visible).toBe(paused.visible);
  await page.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: 'EV charging & fuel' }).click();
  await expect
    .poll(async () => page.evaluate(() => window.__hub!.cameraTarget().x), { timeout: 15_000 })
    .toBeGreaterThan(100);

  const rate = async (label: string): Promise<number> => {
    await speed.getByRole('button', { name: label }).click();
    const a = await page.evaluate(() => ({ t: window.__hub!.simTimes().visible, wall: performance.now() }));
    await page.waitForTimeout(3_000);
    const b = await page.evaluate(() => ({ t: window.__hub!.simTimes().visible, wall: performance.now() }));
    return (b.t - a.t) / ((b.wall - a.wall) / 1000);
  };
  const normal = await rate('15×');
  const fast = await rate('45×');
  expect(normal).toBeGreaterThan(0);
  expect(fast / normal).toBeGreaterThan(2);
  const t = await simTimes(page);
  expect(t.visible).toBe(t.baseline);
});

test.describe('on a phone (S-10)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the What-if drawer fits the screen as a bottom sheet', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'What-if scenarios' }).click();
    const drawer = page.getByRole('dialog', { name: 'What-if scenarios' });
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 0.5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
