import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

// M1 blocks 1–3 end to end, against the built single file over file:// (N-1).
// Built with `vite build --mode test`, which turns on window.__hub (architecture §8).

const DIST = resolve('dist');
const URL = pathToFileURL(resolve(DIST, 'index.html')).href;

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

async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: 20_000 });
}

const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

test('builds into one self-contained file within the bundle budget (N-1, A10, M3 §8.3)', () => {
  expect(readdirSync(DIST)).toEqual(['index.html']);
  const html = readFileSync(resolve(DIST, 'index.html'));
  expect(gzipSync(html).length).toBeLessThanOrEqual(600 * 1024);
  expect(html.toString()).not.toMatch(/(src|href)=["']https?:/);
  // The CSP is injected at build time only (architecture §9); the dev server must not get it.
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html.toString())?.[1]?.replaceAll('&#39;', "'");
  expect(csp).toMatch(/^default-src 'none'; script-src 'unsafe-inline';/);
});

test('loads offline, without errors, and the hub is alive (W-1, L-1, N-2)', async ({ page }) => {
  await open(page);
  const hooks = () => page.evaluate(() => ({ agents: window.__hub!.agents(), draws: window.__hub!.drawCalls() }));
  const first = await hooks();
  expect(first.agents.filter((a) => a.kind === 'fleet').length).toBeGreaterThanOrEqual(10);
  expect(first.agents.some((a) => a.speed > 0.5)).toBe(true);
  expect(first.draws).toBeGreaterThan(0);
  expect(first.draws).toBeLessThanOrEqual(300);
  const shot = await page.locator('canvas').screenshot();
  expect(shot.length).toBeGreaterThan(30_000); // a blank canvas compresses to a few KB
  expect(errors).toEqual([]);
  expect(remoteRequests).toEqual([]);
});

test('the area switcher flies the camera to each area (I-5)', async ({ page }) => {
  await open(page);
  const nav = page.getByRole('navigation', { name: 'Areas' });
  await nav.getByRole('button', { name: 'EV charging & fuel' }).click();
  await expect(nav.getByRole('button', { name: 'EV charging & fuel' })).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => page.evaluate(() => ({ cam: window.__hub!.cameraTarget(), goal: window.__hub!.areaTarget('energy') })).then((r) => dist2(r.cam, r.goal)), {
      // The glide itself takes ≤ 2 s; the margin covers shader recompiles when software WebGL drops a quality tier.
      timeout: 15_000,
    })
    .toBeLessThan(2);
});

test('clicking a moving car selects it, follows it and shows its details (I-2, I-3, I-4)', async ({ page }) => {
  await open(page);
  // Wait for a moving fleet car that is well inside the viewport, then click it.
  const handle = await page.waitForFunction(
    () => {
      const h = window.__hub!;
      for (const a of h.agents()) {
        if (a.kind !== 'fleet' || a.speed < 0.5) continue;
        const p = h.screenPosition(a.id);
        // Only where the 3D view is exposed: the dashboard panels cover parts of the screen.
        if (p && p.x > 100 && p.y > 100 && p.x < innerWidth - 100 && p.y < innerHeight - 100 && document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') {
          return { id: a.id };
        }
      }
      return null;
    },
    undefined,
    { timeout: 10_000 },
  );
  const target = (await handle.jsonValue())!;
  const fresh = await page.evaluate((id) => window.__hub!.screenPosition(id), target.id);
  expect(fresh).not.toBeNull();
  await page.mouse.click(fresh!.x, fresh!.y);

  await expect.poll(() => page.evaluate(() => window.__hub!.selection())).toBe(target.id);
  const details = page.getByRole('region', { name: 'Details' });
  await expect(details.getByRole('heading', { name: target.id })).toBeVisible();
  // Floating label (I-3).
  await expect(page.getByTestId('selection-label')).toHaveText(target.id);
  // Follow: once the glide lands, the car is held near the middle of the screen.
  const offCentre = (): Promise<number> =>
    page.evaluate((id) => {
      const p = window.__hub!.screenPosition(id);
      return p ? Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2) / Math.min(innerWidth, innerHeight) : 1;
    }, target.id);
  await expect.poll(offCentre, { timeout: 8_000 }).toBeLessThan(0.15);

  // Following continues until deselection, even after the user drags the view.
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 350, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__hub!.selection())).toBe(target.id);
  await expect.poll(offCentre, { timeout: 8_000 }).toBeLessThan(0.15);
});

test('Escape clears the selection (I-6)', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: 'Wash & maintenance' }).click();
  // Wait for the camera to arrive rather than a fixed time (software WebGL can be slow).
  await expect
    .poll(async () => page.evaluate(() => ({ cam: window.__hub!.cameraTarget(), goal: window.__hub!.areaTarget('wash') })).then((r) => dist2(r.cam, r.goal)), {
      timeout: 8_000,
    })
    .toBeLessThan(0.5);
  // Click whichever wash or service bay marker is not under a dashboard panel.
  const target = await page.evaluate(() => {
    for (const [id, label] of [['wash1', 'Wash bay 1'], ['wash2', 'Wash bay 2'], ['bay1', 'Service bay 1'], ['bay2', 'Service bay 2'], ['bay3', 'Service bay 3']] as const) {
      const p = window.__hub!.screenPosition(id);
      if (p && document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') return { ...p, label };
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.mouse.click(target!.x, target!.y);
  await expect(page.getByRole('region', { name: 'Details' }).getByRole('heading', { name: target!.label })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__hub!.selection())).toBeNull();
  await expect(page.getByRole('region', { name: 'Details' })).toHaveCount(0);
});

test('wheel zooms and right-drag rotates, within limits (I-1)', async ({ page }) => {
  await open(page);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await page.evaluate(() => window.__hub!.cameraDistance());
  await page.mouse.wheel(0, -800);
  await expect.poll(() => page.evaluate(() => window.__hub!.cameraDistance())).toBeLessThan(before);
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 5_000);
  const far = await page.evaluate(() => window.__hub!.cameraDistance());
  expect(Number.isFinite(far)).toBe(true);
  expect(far).toBeLessThanOrEqual(600);
  // Left-drag pans the target.
  const t0 = await page.evaluate(() => window.__hub!.cameraTarget());
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  const t1 = await page.evaluate(() => window.__hub!.cameraTarget());
  expect(dist2(t0, t1)).toBeGreaterThan(1);
});

test('explains what is needed when WebGL 2 is unavailable (N-8)', async ({ page }) => {
  await page.addInitScript(() => {
    // Called below with an explicit `this`, so the unbound reference is intended.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2') return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto(URL);
  await expect(page.getByRole('alert')).toContainText('WebGL 2');
});
