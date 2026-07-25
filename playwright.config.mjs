import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/e2e/foundry-container.mjs';
import { STORAGE_STATE } from './tests/e2e/global-setup.mjs';

export default defineConfig({
  testDir: './tests/e2e/specs',
  // Foundry is a single shared world: parallel workers would race on the same
  // documents and settings. The suite is deliberately serial.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './tests/e2e/global-setup.mjs',
  globalTeardown: './tests/e2e/global-teardown.mjs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    // Foundry hard-refuses to start below 1366x768 and shows a blocking
    // "unsupported resolution" notice instead of the UI. Playwright's default
    // viewport is 1280x720, which trips it.
    viewport: { width: 2560, height: 1440 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
