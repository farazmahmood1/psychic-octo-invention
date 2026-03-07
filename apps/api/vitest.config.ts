import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: [
        'src/services/**',
        'src/middleware/**',
        'src/routes/**',
        'src/security/**',
        'src/orchestration/**',
        'src/integrations/**',
        'src/utils/**',
        'src/validators/**',
      ],
      exclude: ['src/tests/**'],
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
