// Regenerates the README screenshots in docs/media (requirements SH-13). Run with `npm run screenshots`,
// which builds the test bundle first (it exposes window.__hub, used here to wait until the world is ready).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const PAGE = pathToFileURL(resolve('dist/index.html')).href;
const OUT = resolve('docs/media');
const SHOTS = [
  { file: 'overview.jpg', query: '?area=overview&tod=day' },
  { file: 'wash-rain-night.jpg', query: '?area=wash&weather=rain&tod=night' },
  { file: 'airport.jpg', query: '?area=airport&tod=day' },
  { file: 'kiosk.jpg', query: '?kiosk=1&tod=day' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (const shot of SHOTS) {
  await page.goto(PAGE + shot.query + '&quality=0');
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: 60_000 });
  // Let traffic build up and the camera settle.
  await page.waitForTimeout(8_000);
  await page.screenshot({ path: resolve(OUT, shot.file), type: 'jpeg', quality: 82 });
  console.log(`docs/media/${shot.file}`);
}
await browser.close();
