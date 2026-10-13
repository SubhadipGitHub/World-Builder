import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// M7 ops realism end to end (requirements §12, architecture §20), against the test build.
const URL = pathToFileURL(resolve('dist/index.html')).href;

async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => window.__hub?.ready === true, undefined, { timeout: 20_000 });
}

test('the demand readout shows the morning peak and reacts to the weather (R-7)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  const readout = page.getByLabel('Demand');
  await expect(readout).toHaveText(/^Demand ×1\.\d · Morning peak$/);
  const before = Number(/×(\d+\.\d)/.exec((await readout.textContent()) ?? '')?.[1]);
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('heatwave');
  await expect
    .poll(async () => Number(/×(\d+\.\d)/.exec((await readout.textContent()) ?? '')?.[1]), { timeout: 10_000 })
    .toBeGreaterThan(before * 1.3);
  expect(errors).toEqual([]);
});

test('the speed control offers 15× / 30× / 45× (D30)', async ({ page }) => {
  await open(page);
  const group = page.getByRole('group', { name: 'Simulation speed' });
  await expect(group.getByRole('button')).toHaveText(['Pause', '15×', '30×', '45×']);
});
