import { test, expect } from './fixture'

test('IA-06 templates change areas, missions, tools and rules', async ({ page, store }) => {
  await page.goto('/ai/agentes/novo')
  const preview = page.locator('.cr-r')
  await expect(preview).toContainText('Pós-compra')
  const initial = await preview.innerText()
  const templates = page.locator('.cr-models button')
  await templates.first().click()
  await expect(preview).not.toHaveText(initial)
  const firstDetails = await preview.locator('.cr-det').innerText()
  await templates.last().click()
  await expect(preview.locator('.cr-det')).not.toHaveText(firstDetails)
  await expect(preview.locator('.cr-areas li.on')).not.toHaveCount(0)
})

test('IA-07 IA-08 IA-09 copy selects its sources, excludes mission ownership and creates draft at returned ID', async ({ page, store }) => {
  await page.goto('/ai/agentes/novo')
  await page.locator('.cr-copy').getByRole('button', { name: /Leo/ }).click()
  await expect(page.locator('.cr-r')).toContainText('missões não são copiadas')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByLabel('Nome', { exact: true }).fill('   ')
  await expect(page.getByRole('button', { name: 'Criar e abrir editor' })).toBeDisabled()
  await page.getByLabel('Nome', { exact: true }).fill('Ana de teste')
  const expectedSources = store.notes.filter(n => n.readers.includes('a-leo')).map(n => n.id)
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(expectedSources.length)
  await page.getByRole('button', { name: 'Criar e abrir editor' }).click()
  await expect(page).toHaveURL(/\/ai\/construtor\/new-agent-\d+$/)
  const call = store.matching('POST', '/api/ai/agents')[0]
  expect(call.body).toEqual({ name: 'Ana de teste', role: 'Pós-compra', source_ids: expectedSources, copy_from: 'a-leo' })
  expect(call.body).not.toHaveProperty('missions')
  await expect(page.getByText('Rascunho', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.locator('header')).toContainText('Ana de teste')
})

test('IA-08 IA-09 template creation sends selected sources and template ID', async ({ page, store }) => {
  await page.goto('/ai/agentes/novo')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  const box = page.getByRole('checkbox').first(); await box.setChecked(!(await box.isChecked()))
  const selected = await page.locator('.cr-k').evaluateAll(labels => labels.filter(l => (l.querySelector('input') as HTMLInputElement).checked).map(l => l.querySelector('b')!.textContent))
  await page.getByRole('button', { name: 'Criar e abrir editor' }).click()
  await expect(page).toHaveURL(/new-agent-/)
  const body = store.matching('POST', '/api/ai/agents')[0].body!
  expect(body.template_id).toBe('pos-compra')
  expect(body.source_ids).toEqual(store.notes.filter(n => selected.includes(n.name)).map(n => n.id))
})
