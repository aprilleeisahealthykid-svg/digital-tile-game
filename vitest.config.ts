import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['outputs/**', 'work/**', 'node_modules/**'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
