import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // Architecture A9 / N-4: the simulation is pure and deterministic. The airport (M6, H1) follows the same rules.
    files: ['src/sim/**/*.ts', 'src/airport/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['three', 'three/*', 'preact', 'preact/*'], message: 'src/sim must not depend on rendering or UI (N-4).' }] }],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded Rng from sim/rng (A9).' }],
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'Use the sim clock, not wall time (A9).' },
        { name: 'performance', message: 'Use the sim clock, not wall time (A9).' }],
    },
  },
  {
    // Test idioms: `!` after an asserted length, and expect(() => fn()).toThrow().
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  { files: ['*.config.{js,ts}', 'eslint.config.js', 'scripts/**/*.mjs'], ...tseslint.configs.disableTypeChecked },
);
