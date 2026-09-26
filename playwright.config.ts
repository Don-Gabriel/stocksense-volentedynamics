import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/test-api.cjs',
      url: 'http://127.0.0.1:3002/api/health',
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/test-web.cjs',
      url: 'http://127.0.0.1:5174',
      timeout: 30000,
      reuseExistingServer: false,
    },
  ],
});
