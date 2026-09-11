// =============================================
// Testes de ponta a ponta.
//
// Os testes de unidade provam que cada peça está certa; estes provam que
// o lojista consegue fazer o trabalho dele. Rodam contra a aplicação de
// verdade, num navegador de verdade.
//
// Precisam de um ambiente configurado (.env.local com Supabase e as
// credenciais de teste). Sem ele, `pnpm e2e` avisa e sai — não fica
// vermelho por falta de segredo, nem verde sem ter testado nada.
//
//   pnpm e2e            roda tudo, subindo a aplicação sozinho
//   pnpm e2e:ui         abre o modo interativo
//   E2E_BASE_URL=…      roda contra um ambiente já no ar
// =============================================
import { defineConfig, devices } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
/** Quando apontamos para um ambiente já no ar, não subimos outro. */
const useExternalServer = !!process.env.E2E_BASE_URL

/**
 * Chromium do ambiente, quando existe. Sem isto o Playwright exige a
 * revisão exata que ele baixaria, e falha com "please run playwright
 * install" mesmo tendo um navegador ali do lado.
 */
const chromiumPath = (() => {
  const explicit = process.env.E2E_CHROMIUM_PATH
  if (explicit && existsSync(explicit)) return explicit
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!root) return undefined
  for (const rel of ['chromium/chrome-linux/chrome', 'chromium-1194/chrome-linux/chrome']) {
    const p = join(root, rel)
    if (existsSync(p)) return p
  }
  // Qualquer chromium-*/chrome-linux/chrome que exista.
  try {
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith('chromium-')) continue
      const p = join(root, dir, 'chrome-linux', 'chrome')
      if (existsSync(p)) return p
    }
  } catch { /* sem diretório, segue sem caminho explícito */ }
  return undefined
})()

export default defineConfig({
  testDir: './e2e',
  // O trabalho do lojista é sequencial por natureza (criar, publicar,
  // conferir); paralelizar por arquivo já dá o ganho sem embaralhar dados.
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    // O rastro só de quem falhou: é o que se abre para entender o erro.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Vale para todos os projetos, inclusive o de login.
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },

  projects: [
    // Entra uma vez e guarda a sessão; os outros projetos reaproveitam.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/merchant.json',
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
      },
      dependencies: ['setup'],
    },
  ],

  webServer: useExternalServer
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
