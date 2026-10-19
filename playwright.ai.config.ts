import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.AI_UI_BASE_URL || 'http://127.0.0.1:3100'
const runId = process.env.AI_UI_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-')

export default defineConfig({
  testDir: './tests/ai-ui',
  fullyParallel: true,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: `test-results/ai-ui/${runId}`,
  reporter: [['list'], ['html', { outputFolder: `playwright-report/ai-ui/${runId}`, open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'], baseURL, viewport: { width: 1600, height: 1000 },
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : undefined,
  },
  webServer: process.env.AI_UI_BASE_URL ? undefined : {
    command: 'node node_modules/next/dist/bin/next dev -p 3100',
    url: `${baseURL}/ai/agentes`, reuseExistingServer: !process.env.CI, timeout: 180_000,
    stdout: 'pipe', stderr: 'pipe',
    env: {
      IA_UI_COMPARE: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ai-ui-test-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'ai-ui-test-service-key',
    },
  },
})
