import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      all: true,
      include: [
        'backend/src/**/*.{ts,tsx,js,mjs}',
        'extension/**/*.{js,mjs}',
      ],
      exclude: [
        '**/*.stories.*',
        '**/*.d.ts',
        '**/*.test.*',
        '**/*.spec.*',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
