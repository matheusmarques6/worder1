import { test, expect } from './fixture'

test('IA-49 IA-53 period and agent filters agree in summary, chart, table and events', async ({ page, store }) => {
  await page.goto('/ai/atividade')
  await expect(page.getByRole('heading', { name: 'Atividade dos agentes' })).toBeVisible()
  await page.getByRole('button', { name: '30 dias', exact: true }).click()
  await expect.poll(() => store.matching('GET', '/api/ai/activity/events').at(-1)?.query.get('period')).toBe('30')
  await page.locator('tbody tr').filter({ hasText: 'Leo' }).click()
  await expect.poll(() => store.matching('GET', '/api/ai/activity/summary').at(-1)?.query.get('agent')).toBe('a-leo')
  await expect.poll(() => store.matching('GET', '/api/ai/activity/events').at(-1)?.query.get('agent')).toBe('a-leo')
  expect(store.matching('GET', '/api/ai/activity/summary').at(-1)!.query.get('period')).toBe('30')
  expect(store.matching('GET', '/api/ai/activity/events').at(-1)!.query.get('period')).toBe('30')
  await expect(page.locator('.ac-ev')).toHaveCount(1)
  await expect(page.locator('.ac-ev')).toContainText('Leo')
  const total = await page.locator('tfoot td').nth(1).innerText()
  await expect(page.locator('.ac-k').filter({ has: page.getByText('Conversas', { exact: true }) }).locator('b')).toHaveText(total)
})

test('IA-50 IA-51 compare toggles deltas; all seven metrics change requests and stack only sums', async ({ page, store }) => {
  await page.goto('/ai/atividade')
  await expect(page.locator('.ac-dl').first()).toBeVisible()
  await page.locator('.ac-cmp').getByRole('switch').click()
  await expect(page.locator('.ac-dl')).toHaveCount(0)
  expect(store.matching('GET', '/api/ai/activity/summary').at(-1)!.query.get('compare')).toBe('0')
  const metrics = [['Conversas', 'conversations', true], ['Receita atribuída', 'revenue', true], ['Resolvidas sem humano', 'resolved', false], ['Transferências', 'transfers', true], ['Pedidos', 'orders', true], ['Custo', 'cost_usd', true], ['Tempo de 1ª resposta', 'first_response', false]] as const
  for (const [label, metric, stack] of metrics) {
    await page.locator('.ac-ch').first().getByRole('button', { name: label, exact: true }).click()
    await expect.poll(() => store.matching('GET', '/api/ai/activity/summary').at(-1)?.query.get('metric')).toBe(metric)
    await expect(page.locator('.ac-ch h3').first()).toContainText(label)
    await expect(page.locator('.ac-leg em')).toHaveCount(stack ? 1 : 0)
  }
})

test('IA-52 IA-54 BRL table derives cost and return; quality uses store criterion name', async ({ page, store }) => {
  store.summary.usd_brl = 7.25
  await page.goto('/ai/atividade')
  await expect(page.locator('.ac-kpis')).toBeVisible()
  const row = page.locator('tbody tr').filter({ hasText: 'Duda' })
  const costText = await row.locator('td').nth(10).innerText()
  const revenueText = await row.locator('td').nth(5).evaluate(el => el.childNodes[0].textContent || '')
  const parse = (s: string) => Number(s.split('\n')[0].replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  const cost = parse(costText), revenue = parse(revenueText)
  const expectedCost = store.summary.by_agent[0].cost_usd * 7.25
  expect(cost).toBeCloseTo(expectedCost, 2)
  expect(revenue).toBe(store.summary.by_agent[0].revenue)
  await expect(row.locator('td').nth(11)).toHaveText(`${Math.round(revenue / expectedCost).toLocaleString('pt-BR')}×`)
  await expect(page.getByText('Preço diferente do catálogo', { exact: true })).toBeVisible()
})

for (const cost of [0, null]) {
  test(`IA-52 zero or absent cost (${cost}) shows no infinite return`, async ({ page, store }) => {
    store.summary.kpis.cost_usd = cost
    store.summary.by_agent[0].cost_usd = cost
    await page.goto('/ai/atividade')
    await expect(page.locator('tbody tr').filter({ hasText: 'Duda' }).locator('td').nth(11)).toHaveText('—')
    await expect(page.locator('tfoot td').last()).toHaveText('—')
    await expect(page.locator('.ac')).not.toContainText('Infinity')
  })
}

test('IA-55 CSV export carries selected period and agent', async ({ page, store }) => {
  await page.goto('/ai/atividade')
  await page.getByRole('button', { name: '90 dias', exact: true }).click()
  await page.locator('.ac-agents').getByRole('button', { name: 'Duda', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute('href', '/api/ai/activity/export.csv?period=90&agent=a-duda')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Exportar CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('activity.csv')
  const call = store.matching('GET', '/api/ai/activity/export.csv')[0]
  expect(call.query.get('period')).toBe('90'); expect(call.query.get('agent')).toBe('a-duda')
})

test('IA-56 alerts poll with controlled clock and acknowledge/resolve persist', async ({ page, store }) => {
  await page.clock.install()
  await page.goto('/ai/atividade')
  await expect(page.locator('.ac-kpis')).toBeVisible()
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  store.alerts.push({ id: 'alert-1', title: 'Revisão crítica', status: 'open', severity: 'critical', created_at: new Date().toISOString() })
  await page.clock.fastForward(60_000)
  await expect(page.locator('.ac-warn').filter({ hasText: 'Revisão crítica' })).toBeVisible()
  await page.getByRole('button', { name: 'Reconhecer', exact: true }).click()
  await expect(page.locator('.ac-warn').filter({ hasText: 'Revisão crítica' })).toHaveCount(0)
  expect(store.matching('PATCH', '/api/ai/alerts/alert-1')[0].body).toEqual({ status: 'acknowledged' })
  store.alerts.push({ id: 'alert-2', title: 'Segundo alerta', status: 'open', created_at: new Date().toISOString() })
  await page.clock.fastForward(60_000)
  await page.getByRole('button', { name: 'Resolver', exact: true }).click()
  await expect(page.locator('.ac-warn').filter({ hasText: 'Segundo alerta' })).toHaveCount(0)
  expect(store.alerts[1].status).toBe('resolved')
})

test('IA-57 event kind filters customer row and opens matching Inbox contact', async ({ page, store }) => {
  await page.goto('/ai/atividade')
  const register = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Registro de atividade' }) })
  await register.getByRole('button', { name: 'Venda', exact: true }).click()
  await expect(page.locator('.ac-ev')).toHaveCount(1)
  await expect(page.locator('.ac-ev')).toContainText('Lívia Rocha')
  expect(store.matching('GET', '/api/ai/activity/events').at(-1)!.query.get('kind')).toBe('sale')
  await expect(page.locator('.ac-ev')).toHaveAttribute('href', '/whatsapp/inbox?contact=c1')
  await page.locator('.ac-ev').click()
  await expect(page).toHaveURL(/\/whatsapp\/inbox\?contact=c1$/)
  await expect(page.getByText('Mensagem exclusiva de Lívia', { exact: true })).toBeVisible()
  await expect(page.getByText('Mensagem de outra conversa', { exact: true })).toHaveCount(0)
  expect(store.matching('GET', '/api/whatsapp/inbox/conversations/conv-target/messages')).toHaveLength(1)
  expect(store.matching('GET', '/api/whatsapp/inbox/conversations/conv-other/messages')).toHaveLength(0)
})

test('IA-57 Inbox without contact keeps manual conversation selection', async ({ page, store }) => {
  await page.goto('/whatsapp/inbox')
  await expect(page.getByText('Selecione uma conversa', { exact: true })).toBeVisible()
  await page.getByText('Paulo Henrique', { exact: true }).click()
  await expect(page.getByText('Mensagem de outra conversa', { exact: true })).toBeVisible()
  await expect(page.getByText('Mensagem exclusiva de Lívia', { exact: true })).toHaveCount(0)
  expect(store.matching('GET', '/api/whatsapp/inbox/conversations/conv-other/messages')).toHaveLength(1)
  expect(store.matching('GET', '/api/whatsapp/inbox/conversations/conv-target/messages')).toHaveLength(0)
})
