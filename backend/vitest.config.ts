import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // Never pick up build output: compiled CommonJS copies of the suite cannot
    // import Vitest and would fail as phantom duplicates of the real tests.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
