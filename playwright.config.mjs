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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Foundry refuses to run below 1366x768 and covers the UI with an
      // "unsupported resolution" notice instead. The viewport belongs *here*,
      // after the device spread and inside the project: `Desktop Chrome`
      // carries its own 1280x720, and a project's `use` overrides the
      // top-level one — so setting it above looks right and never arrives.
      viewport: { width: 1920, height: 1080 },
    },
  }],
});
