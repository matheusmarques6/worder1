import { test, expect, openBuilder, renameAgent, pickNode } from './fixture'

test('IA-12 clean close navigates directly', async ({ page, store }) => {
  await openBuilder(page)
  await page.getByRole('link', { name: 'Fechar', exact: true }).click()
  await expect(page).toHaveURL(/\/ai\/agentes$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('IA-12 dirty close Cancel preserves draft; Sair discards without PATCH', async ({ page, store }) => {
  await openBuilder(page); await renameAgent(page, 'Rascunho local')
  await page.getByRole('link', { name: 'Fechar', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Sair sem salvar?')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page).toHaveURL(/\/ai\/construtor\/a-duda$/)
  await expect(page.locator('header')).toContainText('Rascunho local')
  await page.getByRole('link', { name: 'Fechar', exact: true }).click()
  await page.getByRole('button', { name: 'Sair', exact: true }).click()
  await expect(page).toHaveURL(/\/ai\/agentes$/)
  expect(store.matching('PATCH', '/api/ai/agents/a-duda')).toHaveLength(0)
  await openBuilder(page)
  await expect(page.locator('header')).toContainText('Duda')
  await expect(page.locator('header')).not.toContainText('Rascunho local')
})

test('IA-26 WhatsApp removal Cancel sends no DELETE; Confirmar deletes once and survives reload', async ({ page, store }) => {
  await openBuilder(page)
  await pickNode(page, 'WhatsApp (11) 4000-1234')
  await page.locator('.w-left.insp').getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Tem certeza? Este número para de ser atendido pelo agente.')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  expect(store.matching('DELETE', '/api/ai/agents/a-duda/entries')).toHaveLength(0)
  await expect(page.locator('.w-n').filter({ hasText: 'WhatsApp (11) 4000-1234' })).toHaveCount(1)
  await page.locator('.w-left.insp').getByRole('button', { name: 'Remover', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.locator('.w-n').filter({ hasText: 'WhatsApp (11) 4000-1234' })).toHaveCount(0)
  expect(store.matching('DELETE', '/api/ai/agents/a-duda/entries')).toHaveLength(1)
  expect(store.matching('DELETE', '/api/ai/agents/a-duda/entries')[0].query.get('entry_id')).toBe('e1')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Renomear', exact: true })).toBeVisible()
  await expect(page.locator('.w-n').filter({ hasText: 'WhatsApp (11) 4000-1234' })).toHaveCount(0)
})

test('IA-11 IA-13 IA-14 save creates version, rename survives reload, undo/redo reset', async ({ page, store }) => {
  await openBuilder(page); await renameAgent(page, 'Duda nova')
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.locator('header')).toContainText('Duda ·')
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Refazer', exact: true }).click()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.locator('header')).toContainText('Salvo · versão 4')
  expect(store.matching('PATCH', '/api/ai/agents/a-duda')[0].body!.name).toBe('Duda nova')
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refazer', exact: true })).toBeDisabled()
  await page.reload(); await expect(page.locator('header')).toContainText('Duda nova')
})

for (const field of ['presentation', 'adaptation'] as const) {
  test(`IA-11 isolated ${field} saves a version and survives reload (simulated API)`, async ({ page, store }) => {
    await openBuilder(page)
    if (field === 'presentation') {
      await pickNode(page, 'Duda')
      await page.locator('.w-left.insp select').first().selectOption({ label: 'Só o nome' })
    } else {
      await pickNode(page, 'Adaptação ao cliente')
      await page.getByRole('switch', { name: 'Espelhar formalidade', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(page.locator('header')).toContainText('Salvo · versão 4')
    const body = store.matching('PATCH', '/api/ai/agents/a-duda')[0].body!
    if (field === 'presentation') expect(body.presentation_mode).toBe('discreta')
    else expect(body.client_adaptation.mirror_tone).toBe(false)
    await page.reload()
    await expect(page.locator('header')).toContainText('Salvo · versão 4')
    if (field === 'presentation') {
      await pickNode(page, 'Duda')
      await expect(page.locator('.w-left.insp select').first()).toHaveValue('Só o nome')
    } else {
      await pickNode(page, 'Adaptação ao cliente')
      await expect(page.getByRole('switch', { name: 'Espelhar formalidade', exact: true })).toHaveAttribute('aria-checked', 'false')
    }
    await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0)
    expect(store.matching('PATCH', '/api/ai/agents/a-duda')).toHaveLength(1)
  })
}

test('IA-15 pause Cancel preserves active; confirm persists; activation opens checklist', async ({ page, store }) => {
  await openBuilder(page)
  await page.getByRole('switch', { name: 'Ativo' }).click()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  expect(store.matching('POST', '/api/ai/agents/a-duda/pause')).toHaveLength(0)
  await page.getByRole('switch', { name: 'Ativo' }).click()
  await page.getByRole('button', { name: 'Pausar', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Ativo' })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('switch', { name: 'Ativo' }).click()
  await expect(page.getByRole('dialog')).toContainText('Antes de ativar Duda')
  await page.getByRole('button', { name: 'Ativar Duda' }).click()
  await expect(page.getByRole('switch', { name: 'Ativo' })).toHaveAttribute('aria-checked', 'true')
})

test('IA-16 IA-17 IA-18 diagnostics selects block, metrics toggle and history restore Cancel/confirm', async ({ page, store }) => {
  await openBuilder(page)
  await page.getByRole('button', { name: /^Diagnosticar/ }).click()
  await expect(page.locator('.w-left')).toContainText('Diagnóstico')
  await page.locator('.w-iss').first().click()
  await expect(page.locator('.w-left.insp')).not.toContainText('Diagnóstico')
  const before = await page.locator('.w-main .w-mets').count()
  await page.getByRole('button', { name: 'Métricas', exact: true }).click()
  await expect(page.locator('.w-main .w-mets')).toHaveCount(0)
  expect(before).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Histórico', exact: true }).click()
  await page.getByRole('button', { name: /Versão 13/ }).click()
  await page.getByRole('button', { name: 'Restaurar esta versão' }).click()
  await expect(page.getByRole('dialog')).toContainText('Restaurar a versão 13?')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  expect(store.calls.filter(c => c.method === 'POST' && c.path.endsWith('/restore'))).toHaveLength(0)
  await page.getByRole('button', { name: 'Restaurar esta versão' }).click()
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click()
  await expect(page.locator('.vl .cur')).toContainText('Versão 4')
  expect(store.matching('POST', '/api/ai/agents/a-duda/versions/v13/restore')).toHaveLength(1)
  expect(store.versions['a-duda']).toHaveLength(4)
})

test('IA-19 Playground sends unsaved draft and scenario, never PATCHes the agent', async ({ page, store }) => {
  await openBuilder(page); await renameAgent(page, 'Duda em teste')
  await page.getByRole('button', { name: 'Testar', exact: true }).click()
  await page.getByPlaceholder('Mensagem do cliente').fill('Qual o prazo?')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.getByText('Aprovada na primeira tentativa')).toBeVisible()
  expect(store.matching('POST', '/api/ai/agents/a-duda/simulate')[0].body).toMatchObject({ message: 'Qual o prazo?', agent_draft: { name: 'Duda em teste' }, channel: 'whatsapp' })
  expect(store.matching('PATCH', '/api/ai/agents/a-duda')).toHaveLength(0)
  await page.getByRole('button', { name: 'Salvar como cenário de avaliação' }).click()
  await expect(page.getByRole('button', { name: 'Salvo em Avaliação' })).toBeDisabled()
  expect(store.matching('POST', '/api/ai/agents/a-duda/scenarios')[0].body!.user_turns).toEqual(['Qual o prazo?'])
})

test('IA-19 blocked Playground response exposes reviewer failure and hides rejected reply', async ({ page, store }) => {
  store.simulation = { ...store.simulation, blocked: true, blocked_by: 'Preço', reply: 'Texto retido que não deve aparecer', attempts: [{ attempt: 0, outcome: 'fail' }, { attempt: 1, outcome: 'fail' }, { attempt: 2, outcome: 'fail' }] }
  await openBuilder(page)
  await page.getByRole('button', { name: 'Testar', exact: true }).click()
  await page.getByPlaceholder('Mensagem do cliente').fill('Um pedido que a revisão rejeita')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.locator('.pb.blk')).toContainText('Nada seria enviado')
  await expect(page.locator('.tr')).toContainText('Reprovada: Preço')
  await expect(page.getByText('Texto retido que não deve aparecer', { exact: true })).toHaveCount(0)
  await expect(page.locator('.pb.ai')).toHaveCount(0)
  expect(store.matching('POST', '/api/ai/agents/a-duda/simulate')[0].body).toMatchObject({ message: 'Um pedido que a revisão rejeita', agent_draft: null })
  expect(store.matching('PATCH', '/api/ai/agents/a-duda')).toHaveLength(0)
})

test('IA-20 palette filters and agent selector navigates', async ({ page, store }) => {
  await openBuilder(page)
  await page.getByPlaceholder('Buscar blocos...').fill('Instagram')
  await expect(page.locator('.w-pi').filter({ hasText: 'Instagram' })).toHaveAttribute('aria-disabled', 'true')
  await page.getByLabel('Agente', { exact: true }).selectOption('a-leo')
  await expect(page).toHaveURL(/\/ai\/construtor\/a-leo$/)
})
