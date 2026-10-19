import { test, expect } from './fixture'

test('IA-38 autosave uses controlled clock, shows saving/saved, persists reload and reports API errors', async ({ page, store }) => {
  await page.clock.install()
  await page.goto('/ai/conhecimento?note=s3')
  await expect(page.getByLabel('Título da nota')).toHaveValue('Política de troca')
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  await page.getByRole('button', { name: 'Edição', exact: true }).click()
  await page.locator('textarea.kn-src').fill('Texto salvo pelo teste')
  await expect(page.locator('header')).toContainText('Salvando…')
  expect(store.matching('PATCH', '/api/ai/knowledge/s3')).toHaveLength(0)
  await page.clock.fastForward(850)
  await expect.poll(() => store.notes.find(n => n.id === 's3')!.body_markdown).toBe('Texto salvo pelo teste')
  await expect(page.locator('header')).toContainText('Salvo')
  await page.reload()
  await expect(page.locator('.kn')).toContainText('Texto salvo pelo teste')
  store.failures.set('PATCH /api/ai/knowledge/s3', { status: 500, error: 'Falha de gravação de teste' })
  await page.getByRole('button', { name: 'Edição', exact: true }).click()
  await page.locator('textarea.kn-src').fill('Tentativa rejeitada')
  await page.clock.fastForward(850)
  await expect(page.getByRole('status')).toContainText('Falha de gravação de teste')
  expect(store.notes.find(n => n.id === 's3')!.body_markdown).toBe('Texto salvo pelo teste')
})

test('IA-38 synchronized source is read only', async ({ page, store }) => {
  await page.goto('/ai/conhecimento?note=s1')
  await expect(page.getByLabel('Título da nota')).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Edição', exact: true })).toHaveCount(0)
  await expect(page.locator('.kn-ro')).toContainText('Sincronizada automaticamente')
  await page.keyboard.press('Control+e')
  await expect(page.locator('textarea.kn-src')).toHaveCount(0)
})

test('IA-39 IA-40 rename rewrites links; readers affect only selected note and agent', async ({ page, store }) => {
  store.notes.find(n => n.id === 's4')!.body_markdown = 'Consulte [[Política de troca]] agora.'
  await page.goto('/ai/conhecimento?note=s3')
  await page.getByLabel('Título da nota').fill('Troca atualizada')
  await page.getByLabel('Título da nota').press('Enter')
  await expect(page.getByRole('status')).toContainText('Links nas outras notas foram atualizados')
  expect(store.notes.find(n => n.id === 's4')!.body_markdown).toContain('[[Troca atualizada]]')
  await page.getByRole('button', { name: 'Tirar Duda', exact: true }).click()
  await expect.poll(() => store.notes.find(n => n.id === 's3')!.readers).toEqual(['a-leo'])
  expect(store.notes.find(n => n.id === 's2')!.readers).toEqual(['a-duda', 'a-leo'])
  await page.getByRole('button', { name: 'Tirar Leo', exact: true }).click()
  await expect(page.locator('.kb-status')).toContainText('Nenhum agente lê esta nota')
  await page.reload()
  await expect(page.getByLabel('Título da nota')).toHaveValue('Troca atualizada')
  await expect(page.locator('.kb-status')).toContainText('Nenhum agente lê esta nota')
})

test('IA-41 missing wiki link creates titled note and opens editor', async ({ page, store }) => {
  store.notes.find(n => n.id === 's3')!.body_markdown = 'Veja [[Garantia inédita]] para saber mais.'
  await page.goto('/ai/conhecimento?note=s3')
  await page.getByRole('link', { name: 'Garantia inédita', exact: true }).click()
  await expect(page.getByLabel('Título da nota')).toHaveValue('Garantia inédita')
  await expect(page.locator('textarea.kn-src')).toBeVisible()
  expect(store.matching('POST', '/api/ai/knowledge')[0].body!.name).toBe('Garantia inédita')
})

test('IA-42 IA-43 usage outcomes, backlink destination and heading navigation', async ({ page, store }) => {
  store.notes.find(n => n.id === 's4')!.body_markdown = 'Veja [[Política de troca]] para detalhes.'
  await page.goto('/ai/conhecimento?note=s3')
  await expect(page.locator('.kr')).toBeVisible()
  await expect(page.locator('.kr')).toContainText('transferiu')
  await expect(page.locator('.kr')).toContainText('Posso trocar se não servir?')
  await page.locator('.kr').getByRole('button', { name: /^Links/ }).click()
  await page.getByRole('button', { name: 'Como funciona', exact: true }).click()
  await expect(page.locator('[data-bi].kb-hi')).toContainText('Como funciona')
  await page.locator('.kr-bl').filter({ hasText: 'Garantia e assistência' }).click()
  await expect(page.getByLabel('Título da nota')).toHaveValue('Garantia e assistência')
})

for (const outcome of ['source', 'rule', 'missing', 'credential'] as const) {
  test(`IA-44 knowledge test ${outcome} checks request and resulting action`, async ({ page, store }) => {
    if (outcome === 'rule') store.ask.best.chunk_kind = 'regra'
    if (outcome === 'missing') store.ask = { answered: false, best: null }
    if (outcome === 'credential') store.failures.set('POST /api/ai/knowledge/ask', { status: 400, error: 'Configure a chave OpenAI para testar' })
    await page.goto('/ai/conhecimento?note=s3')
    await expect(page.locator('.kr')).toBeVisible()
    await page.locator('.kr').getByRole('button', { name: 'Testar', exact: true }).click()
    await page.getByPlaceholder('Pergunta de um cliente').fill('Pergunta do teste')
    await page.getByRole('button', { name: 'Perguntar', exact: true }).click()
    await expect.poll(() => store.matching('POST', '/api/ai/knowledge/ask').length).toBe(1)
    expect(store.matching('POST', '/api/ai/knowledge/ask')[0].body).toEqual({ agent_id: 'a-duda', question: 'Pergunta do teste' })
    if (outcome === 'source') { await expect(page.locator('.kt-src')).toContainText('Política de troca'); await page.getByRole('button', { name: 'Ver trecho' }).click(); await expect(page.getByLabel('Título da nota')).toHaveValue('Política de troca') }
    if (outcome === 'rule') { await expect(page.locator('.kt-rule')).toContainText('não responde e transfere'); await expect(page.getByRole('button', { name: 'Adicionar às lacunas' })).toHaveCount(0) }
    if (outcome === 'credential') await expect(page.locator('.kt-miss')).toContainText('Configure a chave OpenAI')
    if (outcome === 'missing') {
      await page.getByRole('button', { name: 'Adicionar às lacunas' }).click()
      await expect(page.locator('.kgap').filter({ hasText: 'Pergunta do teste' })).toBeVisible()
      expect(store.matching('POST', '/api/ai/knowledge/gaps')[0].body).toEqual({ question: 'Pergunta do teste', agent_id: 'a-duda' })
    }
  })
}

test('IA-45 gap append opens suggested note in edit; create and health limit resolve correct gaps', async ({ page, store }) => {
  await page.goto('/ai/conhecimento?note=s3')
  await page.getByRole('button', { name: 'Lacunas', exact: true }).click()
  const health = page.locator('.kgap').filter({ hasText: 'gravidez' })
  await expect(health.getByRole('button', { name: 'Virar limite' })).toBeVisible()
  await expect(page.locator('.kgap').filter({ hasText: 'PIX' }).getByRole('button', { name: 'Virar limite' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Responder em Formas de pagamento' }).click()
  await expect(page.getByLabel('Título da nota')).toHaveValue('Formas de pagamento')
  await expect(page.locator('textarea.kn-src')).toContainText('Aceitam PIX parcelado?')
  expect(store.matching('POST', '/api/ai/knowledge/gaps/g2/resolve')[0].body).toMatchObject({ action: 'append_to', source_id: 's6' })
  await page.getByRole('button', { name: 'Lacunas', exact: true }).click()
  await page.locator('.kgap').filter({ hasText: 'gravidez' }).getByRole('button', { name: 'Virar limite' }).click()
  await expect(page.locator('.kgap').filter({ hasText: 'gravidez' })).toHaveCount(0)
  expect(store.agents[0].settings.safety.blocked_topics).toContain('O sérum pode ser usado durante a gravidez?')
  await page.locator('.kgap').filter({ hasText: 'embalagem' }).getByRole('button', { name: 'Criar nota nova' }).click()
  await expect(page.locator('textarea.kn-src')).toBeVisible()
  expect(store.matching('POST', '/api/ai/knowledge/gaps/g1/resolve')[0].body!.action).toBe('create_source')
  expect(store.gaps).toHaveLength(0)
})

test('IA-46 graph renders note/link/reader sets and filters without coordinate assertions', async ({ page, store }) => {
  await page.goto('/ai/conhecimento')
  await page.getByRole('button', { name: 'Grafo', exact: true }).click()
  await expect(page.locator('.kg-n.note')).toHaveCount(store.notes.length)
  await expect(page.locator('.kg-n.agent')).toHaveCount(store.agents.length)
  const expectedLinks = store.notes.reduce((sum, n) => sum + (n.links?.length || 0), 0)
  await expect(page.locator('.kg-e.link')).toHaveCount(expectedLinks)
  await expect(page.locator('.kg-e.agent')).toHaveCount(store.notes.reduce((sum, n) => sum + n.readers.length, 0))
  await page.locator('.kg-ctl').getByRole('button', { name: 'Duda', exact: true }).click()
  await expect(page.locator('.kg-n.note:not(.dim)')).toHaveCount(store.notes.filter(n => n.readers.includes('a-duda')).length)
  await page.locator('.kg-ctl label').filter({ hasText: 'Agentes' }).getByRole('switch').click()
  await expect(page.locator('.kg-n.agent')).toHaveCount(0)
  await page.locator('.kg-ctl label').filter({ hasText: 'Lacunas' }).getByRole('switch').click()
  await expect(page.locator('.kg-n.gap')).toHaveCount(0)
})

for (const kind of ['Texto', 'Página da loja', 'Documento', 'Perguntas e respostas']) {
  test(`IA-47 import ${kind} persists and enforces required readers`, async ({ page, store }) => {
    await page.goto('/ai/conhecimento')
    await page.getByRole('button', { name: 'Importar', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: kind, exact: true }).click()
    const needsReader = kind === 'Página da loja' || kind === 'Documento'
    if (needsReader) {
      await dialog.getByRole('button', { name: 'Duda', exact: true }).click()
      await dialog.getByRole('button', { name: 'Leo', exact: true }).click()
      await dialog.getByRole('button', { name: 'Importar', exact: true }).click()
      await expect(dialog).toContainText('Escolha ao menos um agente')
      expect(store.calls.filter(c => c.method === 'POST' && c.path.startsWith('/api/ai/'))).toHaveLength(0)
      await dialog.getByRole('button', { name: 'Duda', exact: true }).click()
    }
    if (kind === 'Texto') { await dialog.getByPlaceholder('Garantia e assistência').fill('Importação de teste'); await dialog.locator('textarea').fill('Conteúdo de teste') }
    if (kind === 'Página da loja') await dialog.getByPlaceholder('https://sualoja.com.br/pages/medidas').fill('https://example.test/medidas')
    if (kind === 'Documento') await dialog.locator('input[type=file]').setInputFiles({ name: 'guia.txt', mimeType: 'text/plain', buffer: Buffer.from('Guia de troca') })
    if (kind === 'Perguntas e respostas') await dialog.locator('textarea').fill('pergunta,resposta\nPrazo?,3 dias')
    await dialog.getByRole('button', { name: 'Importar', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('Fonte adicionada')
    expect(store.notes).toHaveLength(7)
    const post = store.calls.filter(c => c.method === 'POST' && c.path.startsWith('/api/ai/')).at(-1)!
    if (kind === 'Documento') { expect(post.path).toBe('/api/ai/agents/a-duda/sources/upload'); expect(post.raw).toContain('guia.txt') }
    if (kind === 'Página da loja') expect(post.body).toMatchObject({ source_type: 'url', url: 'https://example.test/medidas' })
    if (kind === 'Texto') expect(post.body).toMatchObject({ name: 'Importação de teste', body_markdown: 'Conteúdo de teste', agent_ids: ['a-duda', 'a-leo'] })
    if (kind === 'Perguntas e respostas') expect(post.body).toMatchObject({ csv: 'pergunta,resposta\nPrazo?,3 dias', mode: 'faq' })
  })
}

test('IA-48 Ctrl K opens commands; one character does not query, two query and highlight', async ({ page, store }) => {
  await page.clock.install()
  await page.goto('/ai/conhecimento')
  await expect(page.getByLabel('Título da nota')).toBeVisible()
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Comandos' })).toBeVisible()
  await page.getByPlaceholder('Abrir nota ou rodar comando').press('Escape')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByPlaceholder('Buscar em todas as notas').fill('t')
  await page.clock.fastForward(300)
  expect(store.matching('GET', '/api/ai/knowledge/search')).toHaveLength(0)
  await page.getByPlaceholder('Buscar em todas as notas').fill('troca')
  await page.clock.fastForward(300)
  await expect(page.locator('.ks-r mark').first()).toHaveText(/troca/i)
  expect(store.matching('GET', '/api/ai/knowledge/search')[0].query.get('q')).toBe('troca')
  await page.locator('.ks-r').first().click()
  await expect(page.getByLabel('Título da nota')).toHaveValue('Política de troca')
})
