// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  globalSetup:    './tests/e2e/global-setup.js',
  globalTeardown: './tests/e2e/global-teardown.js',

  // Serial execution — all specs share one live SQLite DB; each test resets via beforeEach
  fullyParallel: false,
  workers: 1,

  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  reporter: process.env.CI
    ? [['junit', { outputFile: 'test-results/results.xml' }], ['list']]
    : [['html', { open: 'on-failure' }], ['list']],

  webServer: [
    {
      command: 'node server/index.js',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      env: { NODE_ENV: 'test', DB_PATH: './test.db' },
    },
    {
      command: 'npm run dev --prefix client',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
