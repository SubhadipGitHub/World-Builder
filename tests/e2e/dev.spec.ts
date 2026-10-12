import { expect, test } from '@playwright/test';

// Regression guard: `npm run dev` must render (the build-only CSP once blanked the dev page).
test('the dev server renders the hub without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    // Chromium DevTools probes this URL; it is not the app's request.
    if (m.type() === 'error' && !m.text().includes('.well-known/appspecific')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5174/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('navigation', { name: 'Areas' })).toBeVisible();
  expect(errors).toEqual([]);
});
