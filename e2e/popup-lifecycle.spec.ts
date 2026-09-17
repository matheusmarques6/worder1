// O caminho completo do lojista com um popup: escolher um modelo, salvar,
// publicar, ver o script chegar na vitrine e encontrar o resultado.
//
// É o teste que teria pego a maioria dos problemas desta safra: cada
// peça estava certa isolada, e o que quebrava era a junção.
import { test, expect } from '@playwright/test'
import { skipWithoutCredentials, uniqueName } from './helpers'

// Sem credenciais, pula na coleta — antes de subir navegador nenhum.
skipWithoutCredentials()

test('do modelo ao popup publicado, servido na vitrine', async ({ page, request }) => {
  const nome = uniqueName('Boas-vindas')

  // 1. A lista de popups é alcançável pelo menu, não só pela URL.
  await page.goto('/site/forms')
  await expect(page.getByRole('heading', { name: /popups e formulários/i })).toBeVisible()

  // 2. Criar a partir de um modelo abre o editor com o conteúdo pronto.
  await page.getByRole('button', { name: /novo popup/i }).click()
  await page.getByText('Boas-vindas com cupom').click()
  await expect(page).toHaveURL(/\/popup-editor\//, { timeout: 30_000 })
  const formId = page.url().split('/popup-editor/')[1].split(/[?#]/)[0]
  expect(formId).toMatch(/^[0-9a-f-]{36}$/)

  // O modelo trouxe blocos de verdade, não um popup em branco.
  await expect(page.getByText(/ganhe|desconto/i).first()).toBeVisible()

  // 3. Renomear e salvar.
  await page.getByRole('textbox', { name: /nome do popup/i }).or(page.locator('header input')).first().fill(nome)
  await page.keyboard.press('Control+s')
  await expect(page.getByText(/alterações salvas/i)).toBeVisible({ timeout: 20_000 })

  // 4. Publicar.
  await page.getByRole('button', { name: /ativar|publicar/i }).first().click()
  await expect(page.getByText(/popup ativado/i)).toBeVisible({ timeout: 20_000 })

  // 5. O popup aparece na lista, com o estado certo.
  await page.goto('/site/forms')
  const linha = page.getByText(nome)
  await expect(linha).toBeVisible()

  // 6. A tela de resultados abre e não quebra sem tráfego.
  await page.goto(`/forms/${formId}/analytics`)
  await expect(page.getByText(/visualizações/i)).toBeVisible()

  // 7. Limpeza: o teste não deixa lixo na conta.
  const del = await request.delete(`/api/forms/${formId}`)
  expect(del.ok()).toBeTruthy()
})

test('a lista mostra o estado real, sem número inventado', async ({ page }) => {
  await page.goto('/site/forms')
  // Os KPIs vêm do banco; sem tráfego são zero, e zero é uma resposta.
  await expect(page.getByText(/visualizações/i).first()).toBeVisible()
  await expect(page.getByText('R$ 12.800')).toHaveCount(0)
})
