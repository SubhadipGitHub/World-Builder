import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Content-Security-Policy for the built single file only (architecture §9). Everything is inlined
 * there, so 'unsafe-inline' is the whole policy. The dev server serves separate module files and
 * would be blocked by it, so the tag is never added in dev.
 */
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:";
function buildOnlyCsp(): Plugin {
  return {
    name: 'build-only-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head' }],
  };
}

export default defineConfig({
  plugins: [preact(), viteSingleFile(), buildOnlyCsp()],
  build: { target: 'es2022', assetsInlineLimit: Number.MAX_SAFE_INTEGER, cssCodeSplit: false },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/sim/**'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
