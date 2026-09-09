// Entra uma vez e guarda a sessão em disco. Os outros testes partem daí:
// repetir o login em cada um deles é lento e frágil.
import { test as setup, expect } from '@playwright/test'
import { credentials, skipWithoutCredentials } from './helpers'

const authFile = 'e2e/.auth/merchant.json'

// Sem credenciais, pula na coleta — antes de subir navegador nenhum.
skipWithoutCredentials(setup)

setup('entrar como lojista', async ({ page }) => {
  const { email, password } = credentials()

  await page.goto('/login')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/senha/i).fill(password)
  await page.getByRole('button', { name: /entrar|acessar/i }).click()

  // A sessão só vale quando o painel abre, não quando o botão é clicado.
  await expect(page).toHaveURL(/\/(dashboard|site|contacts|analytics)/, { timeout: 30_000 })
  await page.context().storageState({ path: authFile })
})
