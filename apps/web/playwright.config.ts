import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against real servers: the built API (demo AI provider) and `next start`.
 * Set E2E_BASE_URL to test an already-running deployment instead.
 */
const external = process.env.E2E_BASE_URL;
const dbUrl = process.env.E2E_DATABASE_URL ?? 'postgres://friday:friday@localhost:5432/friday_e2e';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: external
    ? undefined
    : [
        {
          command: 'node ../api/dist/db/migrate.js && node ../api/dist/db/seed.js && node ../api/dist/index.js',
          url: 'http://localhost:4100/health/ready',
          reuseExistingServer: !process.env.CI,
          env: { DATABASE_URL: dbUrl, PORT: '4100', DEMO_MODE: 'true', LOG_LEVEL: 'warn', WEB_ORIGINS: 'http://localhost:3100', AUTH_RATE_LIMIT_PER_MIN: '200', RATE_LIMIT_PER_MIN: '10000' },
        },
        {
          command: 'npx next start --port 3100',
          url: 'http://localhost:3100/login',
          reuseExistingServer: !process.env.CI,
          env: { API_INTERNAL_URL: 'http://localhost:4100' },
        },
      ],
});
