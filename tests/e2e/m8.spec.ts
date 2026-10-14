import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// M8 ship & share end to end (requirements §13, architecture §21), against the test build.
const URL = pathToFileURL(resolve('dist/index.html')).href;

/** Generous: the first frame compiles every shader, which takes a while under software WebGL in CI. */
const READY_MS = 60_000;
const AREA_ORDER = ['overview', 'return', 'wash', 'energy', 'lot', 'airport'] as const;
const AREA_LABEL: Readonly<Record<(typeof AREA_ORDER)[number], string>> = {
  overview: 'Overview',
  return: 'Return & inspection',
  wash: 'Wash & maintenance',
  energy: 'EV charging & fuel',
  lot: 'Ready lot & exit gate',
  airport: 'Airport',
};
const nextArea = (a: (typeof AREA_ORDER)[number]): (typeof AREA_ORDER)[number] => AREA_ORDER[(AREA_ORDER.indexOf(a) + 1) % AREA_ORDER.length] ?? 'overview';

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(URL + query);
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: READY_MS });
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('a deep link sets the view for this visit and leaves saved preferences alone (SH-5, D42)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.evaluate(() => {
    localStorage.setItem('goldlane.theme', 'dark');
    localStorage.setItem('goldlane.labels', '1');
  });
  await open(page, '?area=wash&weather=rain&tod=night&speed=0&labels=0&theme=light&preset=washDown&select=wash1&seed=demo');
  const hub = await page.evaluate(() => ({
    weather: window.__hub!.weather(),
    theme: window.__hub!.theme(),
    offline: window.__hub!.scenario().offline,
    selection: window.__hub!.selection(),
  }));
  expect(hub).toEqual({ weather: 'rain', theme: 'light', offline: ['wash1'], selection: 'wash1' });
  await expect(page.getByRole('group', { name: 'Time of day' }).getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Simulation speed' }).getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: 'Wash & maintenance' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByRole('switch', { name: 'Building labels' })).toHaveAttribute('aria-checked', 'false');
  // Paused: the hub clock does not move.
  const t0 = await page.evaluate(() => window.__hub!.simTimes().visible);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hub!.simTimes().visible)).toBe(t0);
  expect(await page.evaluate(() => [localStorage.getItem('goldlane.theme'), localStorage.getItem('goldlane.labels')])).toEqual(['dark', '1']);
  expect(errors).toEqual([]);
});

test('invalid link values fall back to defaults without errors (SH-6)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '?area=moon&speed=7&seed=%3Cscript%3E&select=nope&cam=1,2');
  await expect(page.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Simulation speed' }).getByRole('button', { name: '15×' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__hub!.selection())).toBeNull();
  expect(errors).toEqual([]);
});

test('Copy link captures the current view and round-trips (SH-7)', async ({ page }) => {
  await open(page, '?area=energy&seed=share-1');
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('overcast');
  await page.getByRole('group', { name: 'Simulation speed' }).getByRole('button', { name: '30×' }).click();
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  // From file:// the clipboard may be refused: either the notice or the manual-copy dialog appears.
  const fallback = page.getByRole('dialog', { name: 'Copy this link' });
  await expect(page.getByRole('status').filter({ hasText: 'Link copied' }).or(fallback)).toBeVisible();
  const link = await page.evaluate(() => window.__hub!.link());
  if (await fallback.isVisible()) await expect(fallback.getByRole('textbox', { name: 'Link' })).toHaveValue(link);
  expect(link).toContain('area=energy');
  expect(link).toContain('weather=overcast');
  expect(link).toContain('speed=30');
  expect(link).toContain('seed=share-1');
  expect(link).toMatch(/cam=-?[\d.]+,-?[\d.]+,-?[\d.]+,[\d.]+,[\d.]+/);

  // One WebGL page at a time: two software-rendered pages starve each other on a CI runner.
  const context = page.context();
  await page.close();
  const again = await context.newPage();
  await again.goto(link);
  await again.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: READY_MS });
  expect(await again.evaluate(() => window.__hub!.weather())).toBe('overcast');
  await expect(again.getByRole('group', { name: 'Simulation speed' }).getByRole('button', { name: '30×' })).toHaveAttribute('aria-pressed', 'true');
  expect(await again.evaluate(() => window.__hub!.link())).toBe(link);
});

test('embed mode shows only the compact HUD, within the draw-call budget (SH-8)', async ({ page }) => {
  await open(page, '?embed=1&area=lot');
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Key metrics' })).toHaveCount(0);
  const hud = page.getByRole('complementary', { name: 'GoldLane Hub' });
  await expect(hud).toBeVisible();
  const href = await hud.getByRole('link', { name: /Open full view/ }).getAttribute('href');
  expect(href).toContain('area=lot');
  expect(href).not.toContain('embed');
  expect(await page.evaluate(() => window.__hub!.mode())).toBe('embed');
  await page.evaluate(() => {
    window.__hub!.setQualityTier(0);
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hub!.drawCalls())).toBeLessThanOrEqual(300);
});

test('kiosk tours the areas, pauses on input and exits with Esc (SH-9, SH-10)', async ({ page }) => {
  // The tour runs on wall time, so a slow machine may already have moved on: follow whatever area it
  // is on, and pause it before checking anything that takes time.
  await open(page, '?kiosk=1');
  const caption = page.getByRole('region', { name: 'Tour' });
  await expect(page.getByRole('banner')).toHaveCount(0);
  const kiosk = () => page.evaluate(() => window.__hub!.kiosk());

  // Pointer input (the wheel) pauses the tour where it is.
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, 100);
  await expect(page.getByText(/^Tour paused · resumes in \d+ s$/)).toBeVisible();
  const paused = await kiosk();
  expect(paused?.phase).toBe('paused');
  const first = paused?.area ?? 'overview';
  await expect(caption).toContainText(AREA_LABEL[first]);

  // After 60 s without input it resumes on the next area.
  await page.evaluate(() => {
    window.__hub!.advanceKiosk(61);
  });
  const second = nextArea(first);
  expect(await kiosk()).toMatchObject({ phase: 'touring', area: second });
  await expect(caption).toContainText(AREA_LABEL[second]);

  // Key input pauses it too; the flight to the new area still lands.
  await page.keyboard.press('Shift');
  expect(await kiosk()).toMatchObject({ phase: 'paused', area: second });
  await expect
    .poll(async () =>
      page
        .evaluate((id) => ({ cam: window.__hub!.cameraTarget(), goal: window.__hub!.areaTarget(id) }), second)
        .then((r) => Math.hypot(r.cam.x - r.goal.x, r.cam.z - r.goal.z)),
    )
    .toBeLessThan(1);

  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__hub!.mode())).toBe('normal');
  await expect(page.getByRole('banner')).toBeVisible();
  expect(await kiosk()).toBeNull();
});

test('Start tour in the user menu enters kiosk mode (SH-9)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('button', { name: 'Start tour' }).click();
  await expect(page.getByRole('region', { name: 'Tour' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit tour' }).click();
  await expect(page.getByRole('banner')).toBeVisible();
});

test('P saves a captioned PNG of the 3D view (SH-11)', async ({ page }) => {
  await open(page, '?area=wash');
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    return { width: c.width, height: c.height };
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('p')]);
  expect(download.suggestedFilename()).toMatch(/^goldlane-hub-\d{8}-\d{6}\.png$/);
  const path = await download.path();
  const buf = readFileSync(path);
  const scale = Math.min(1, 4096 / size.width);
  expect(pngSize(buf)).toEqual({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
  // A blank or single-colour image compresses to a few KB.
  expect(buf.length).toBeGreaterThan(30_000);

  const [second] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save screenshot' }).click()]);
  expect(second.suggestedFilename()).toMatch(/^goldlane-hub-\d{8}-\d{6}\.png$/);
});

test('help: quick help on hover, full help with ? and Esc (SH-12, SH-12a)', async ({ page }) => {
  await open(page);
  const button = page.getByRole('button', { name: 'Help' });
  await button.hover();
  await expect(page.getByRole('tooltip')).toContainText('Click for full help');
  await page.mouse.move(5, 700);
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Shift+Slash');
  const dialog = page.getByRole('dialog', { name: 'Help' });
  await expect(dialog).toBeVisible();
  // M10: version 0.10.0 (was 0.9.0).
  await expect(dialog).toContainText('0.10.0');
  expect(await page.evaluate(() => window.__hub!.help())).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await button.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close help' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
});
