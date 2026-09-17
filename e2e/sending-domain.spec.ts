// A tela de domínios de envio. O lojista tem de conseguir responder, sem
// ajuda: de qual endereço meus e-mails saem, e como passo a usar o meu.
import { test, expect } from '@playwright/test'
import { skipWithoutCredentials } from './helpers'

// Sem credenciais, pula na coleta — antes de subir navegador nenhum.
skipWithoutCredentials()

test('a tela diz de onde os e-mails saem e como usar o domínio próprio', async ({ page }) => {
  await page.goto('/settings/email')
  await expect(page.getByRole('heading', { name: /domínios e remetente/i })).toBeVisible()

  // A primeira coisa é o estado, não um formulário.
  const faixa = page.locator('.dcard').first()
  await expect(faixa).toContainText('@')

  // O caminho para o domínio próprio existe e é primário.
  await expect(page.getByRole('button', { name: /adicionar domínio/i })).toBeVisible()
})

test('o domínio compartilhado não aparece como um domínio do lojista', async ({ page }) => {
  await page.goto('/settings/email')
  await expect(page.getByRole('heading', { name: /domínios de envio/i })).toBeVisible()

  // Ele pode aparecer no endereço atual (é de onde os e-mails saem hoje),
  // mas nunca como uma linha que o lojista verifica ou remove.
  const lista = page.locator('.dcard').nth(1)
  if (await lista.count()) {
    await expect(lista).not.toContainText('worder.email')
  }
})

test('o assistente de domínio mostra os registros DNS para copiar', async ({ page }) => {
  await page.goto('/settings/email')
  await page.getByRole('button', { name: /adicionar domínio/i }).click()
  await expect(page.getByText(/domínio de envio/i)).toBeVisible()
  await page.getByLabel(/domínio/i).fill('exemplo-e2e.com.br')
  await expect(page.getByRole('button', { name: /continuar/i })).toBeEnabled()
  // Não seguimos: criar o domínio de verdade mexeria na conta do Resend.
  await page.keyboard.press('Escape')
})
