import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Keep Vitest scoped to the unit suite. In particular, this prevents
    // nested local worktrees from contributing Playwright specs to discovery.
    include: ['tests/helpers/**/*.test.js'],
    // The e2e suite is driven by Playwright against a real Foundry instance
    // (see tests/e2e). Its specs use Playwright's runner, not Vitest's.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['module/**/*.mjs'],
      exclude: [
        'node_modules/',
        'scripts/',
        'packs/',
        '**/*.config.js',
        'tests/',
      ],
    },
  },
});
