import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['**/*.test.{ts,tsx,js}', '**/*.spec.{ts,js}'],
    exclude: ['tests/e2e/**', 'node_modules', 'dist', 'dist-server'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['server/**/*.js', 'src/**/*.{ts,tsx}', 'shared/**/*.js'],
      exclude: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
    },
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
