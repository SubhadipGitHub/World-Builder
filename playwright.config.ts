import { defineConfig } from '@playwright/test';

// E2E runs against the built single file over file:// (N-1). Specs land in M1 step 5.
export default defineConfig({
  testDir: 'tests/e2e',
  use: { headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
