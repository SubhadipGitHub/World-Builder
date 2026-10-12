import { defineConfig } from 'vitest/config';

// Long headless runs of the full hub (architecture §8). Kept out of the default `npm test`.
export default defineConfig({
  test: { include: ['tests/soak/**/*.test.ts'], environment: 'node', testTimeout: 600_000 },
});
