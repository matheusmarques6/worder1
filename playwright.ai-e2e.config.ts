import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/ai',
  globalSetup: './e2e/ai/preflight.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results/ai-journeys',
  use: {
    baseURL: process.env.AI_E2E_APP_URL,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    screenshot: 'only-on-failure',
    // Login/session and real customer/provider credentials must not enter traces.
    trace: 'off', video: 'off',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : undefined,
  },
})
