import { defineConfig } from '@playwright/test';

// E2E runs against the built single file over file:// (N-1). `npm run test:e2e` builds it first.
// GitHub's hosted runners render WebGL in software several times slower than a desktop, so CI gets
// longer test and expect timeouts (the assertions themselves are the same) and failure screenshots.
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: CI ? 120_000 : 60_000,
  expect: { timeout: CI ? 15_000 : 5_000 },
  reporter: CI ? [['list'], ['github']] : 'list',
  fullyParallel: false,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: CI ? 'only-on-failure' : 'off',
    // Software WebGL in headless Chromium.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // Dev server for tests/e2e/dev.spec.ts (the rest use the built file over file://).
  webServer: { command: 'npx vite --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: true, timeout: 60_000 },
});
