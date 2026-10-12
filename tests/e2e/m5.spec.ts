import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// M5 branding, building indicators and hub security end to end (requirements §10, architecture §18).
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

const labels = (page: Page) => page.evaluate(() => window.__hub!.facilityLabels());

test('building labels show every facility with a live status (I-1, I-2)', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await labels(page)).map((l) => l.id).sort()).toEqual(['evHub', 'fuel', 'gates', 'lot', 'return', 'service', 'terminal', 'wash']);
  const all = await labels(page);
  for (const l of all) expect(['ok', 'busy', 'offline']).toContain(l.state);
  expect(all.find((l) => l.id === 'terminal')?.text).toContain('GoldLane Rentals');
  expect(all.some((l) => l.visible)).toBe(true);
  await expect(page.getByRole('button', { name: /^Express Wash, (OK|Busy)/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('"Wash tunnel down" turns the wash label Offline (I-2 with M4)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__hub!.applyScenario({ type: 'setUnitOnline', unitId: 'wash1', online: false });
  });
  await expect.poll(async () => (await labels(page)).find((l) => l.id === 'wash')?.state).toBe('offline');
  expect((await labels(page)).find((l) => l.id === 'wash')?.text).toContain('1 offline');
});

test('clicking a label flies the camera to that building (I-4, Q2)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Fuel, / }).click();
  await expect
    .poll(async () => page.evaluate(() => window.__hub!.cameraTarget().x), { timeout: 15_000 })
    .toBeCloseTo(170, 0);
  expect(await page.evaluate(() => window.__hub!.selection())).toBeNull();
});

test('the Building labels switch hides labels and is remembered (I-4)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('switch', { name: 'Building labels' }).click();
  await expect.poll(async () => (await labels(page)).length).toBe(0);
  await page.reload();
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: 20_000 });
  expect(await labels(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByRole('switch', { name: 'Building labels' })).toHaveAttribute('aria-checked', 'false');
});

test('the entry boom lifts for arriving cars and the patrol car drives the perimeter (SEC-2, SEC-4)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__hub!.setSpeed(3);
    window.__hub!.applyScenario({ type: 'surge' });
  });
  await expect.poll(async () => page.evaluate(() => window.__hub!.boomOpen('entry')), { timeout: 30_000 }).toBeGreaterThan(0.5);
  const a = await page.evaluate(() => window.__hub!.patrolPose());
  expect(a).not.toBeNull();
  await page.waitForTimeout(1_500);
  const b = await page.evaluate(() => window.__hub!.patrolPose());
  expect(Math.hypot(b!.x - a!.x, b!.z - a!.z)).toBeGreaterThan(1);
});

test('stays within the draw-call budgets with all M5 detail (§10.5)', async ({ page }) => {
  await open(page);
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('rain');
  await page.getByRole('group', { name: 'Time of day' }).getByRole('button', { name: 'Night' }).click();
  await page.evaluate(() => {
    window.__hub!.setQualityTier(0);
  });
  await expect.poll(async () => page.evaluate(() => window.__hub!.postEffects()), { timeout: 10_000 }).toContain('bloom');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(300);
  await page.evaluate(() => {
    window.__hub!.setQualityTier(2);
  });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(150);
  expect(await page.evaluate(() => window.__hub!.patrolPose())).toBeNull();
  expect(errors).toEqual([]);
});
