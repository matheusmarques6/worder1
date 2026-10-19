import { test, expect } from './fixture'

test('IA-01 IA-02 IA-03 IA-04 agent rows derive status, channels and BRL totals and open Builder', async ({ page, store }) => {
  store.agents[0].conversations_7d = 1234
  store.agents[0].revenue_7d = 9876
  store.agents[1].status = 'draft'
  store.entries['a-leo'] = [{ id: 'flow-only', kind: 'flow_touch', label: 'Recuperação · toque 1' }]
  await page.goto('/ai/agentes')
  const rows = page.getByTestId('agent-row')
  await expect(rows).toHaveCount(3)
  const duda = rows.filter({ hasText: 'Duda' })
  await expect(duda).toContainText('Ativo')
  await expect(duda).toContainText('WhatsApp')
  await expect(duda).toContainText('1 fluxo')
  await expect(duda).toContainText(new Intl.NumberFormat('pt-BR').format(1234))
  await expect(duda).toContainText(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(9876))
  await expect(rows.filter({ hasText: 'Leo' })).toContainText('Rascunho')
  await expect(rows.filter({ hasText: 'Leo' })).toContainText('Fluxo Recuperação')
  await expect(rows.filter({ hasText: 'Bia' })).toContainText('Pausado')
  await expect(rows.filter({ hasText: 'Bia' })).toContainText('Sem canal')
  await duda.click()
  await expect(page).toHaveURL(/\/ai\/construtor\/a-duda$/)
})

test('IA-05 empty list offers creation', async ({ page, store }) => {
  store.agents = []
  await page.goto('/ai/agentes')
  await expect(page.getByText('Nenhum agente ainda')).toBeVisible()
  await page.getByRole('link', { name: 'Novo agente' }).last().click()
  await expect(page).toHaveURL(/\/ai\/agentes\/novo$/)
})

test('IA-01 legacy agent route redirects to Builder', async ({ page, store }) => {
  await page.goto('/ai/agentes/a-duda')
  await expect(page).toHaveURL(/\/ai\/construtor\/a-duda$/)
})
