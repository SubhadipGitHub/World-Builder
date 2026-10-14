import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

/** Version and build date compiled in (SH-3, §21 J12). */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Content-Security-Policy for the built single file only (architecture §9). Everything is inlined
 * there, so 'unsafe-inline' is the whole policy, plus 'wasm-unsafe-eval' so the car-model decoder can
 * compile its WebAssembly (M10-7; JS eval stays blocked). The dev server serves separate module files
 * and would be blocked by it, so the tag is never added in dev.
 */
const CSP = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:";
function buildOnlyCsp(): Plugin {
  return {
    name: 'build-only-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head' }],
  };
}

export default defineConfig({
  plugins: [preact(), viteSingleFile(), buildOnlyCsp()],
  // M10: the fleet car models, imported as inline data URIs (architecture M10-8).
  assetsInclude: ['**/*.glb'],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
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
