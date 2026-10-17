// Real staging only. Inbound is injected as a signed Meta envelope; outbound
// must have a real provider receipt. This does not claim to operate a handset.
import { test, expect, type APIRequestContext } from '@playwright/test'
import { createHmac, randomUUID } from 'node:crypto'

const org = process.env.AI_E2E_ORGANIZATION_ID!
const store = process.env.AI_E2E_STORE_ID!
const accountId = process.env.AI_E2E_ACCOUNT_ID!
const phone = process.env.AI_E2E_RECIPIENT_PHONE!
const run = randomUUID()
let api: APIRequestContext
let account: any
let agentId: string
let sourceId: string
let conversationId: string
let legacyId: string
let settings: any
let originalBotState: any
const agents: string[] = []
const sources: string[] = []

async function json(path: string, method = 'GET', data?: unknown) {
  const response = await api.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path} returned ${response.status()}`).toBe(true)
  return response.json()
}

// Service role is restricted here to reads from the explicitly configured test
// organization. Browser traces never capture these headers.
async function rows(table: string, filters: Record<string, string> = {}) {
  const url = new URL(`/rest/v1/${table}`, process.env.AI_E2E_SUPABASE_URL)
  for (const [key, value] of Object.entries({ select: '*', ...filters, organization_id: `eq.${org}` })) url.searchParams.set(key, value)
  const response = await fetch(url, {
    headers: { apikey: process.env.AI_E2E_SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.AI_E2E_SUPABASE_SERVICE_ROLE_KEY}` },
    signal: AbortSignal.timeout(15_000),
  })
  expect(response.ok, `Staging read failed: ${table} (${response.status})`).toBe(true)
  const data = await response.json()
  expect(Array.isArray(data)).toBe(true)
  expect(data.every((row: any) => row.organization_id === org)).toBe(true)
  return data as any[]
}

async function inbound(text: string) {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{
    id: account.waba_id, changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp', metadata: { phone_number_id: account.phone_number_id, display_phone_number: account.phone_number },
      contacts: [{ profile: { name: `QA ${run}` }, wa_id: phone }],
      messages: [{ from: phone, id: `wamid.qa-${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
    } }],
  }] })
  const signature = createHmac('sha256', process.env.AI_E2E_META_APP_SECRET!).update(body).digest('hex')
  const response = await fetch(new URL('/api/whatsapp/cloud/webhook', process.env.AI_E2E_APP_URL), {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` },
    body, signal: AbortSignal.timeout(30_000),
  })
  expect(response.ok, `Signed inbound rejected (${response.status})`).toBe(true)
}

async function readyAndActivate(id: string) {
  const evaluation = await json('/api/ai/evals/run', 'POST', { agent_id: id })
  expect(typeof evaluation.run_id).toBe('string')
  await expect.poll(async () => (await json(`/api/ai/agents/${id}/readiness`)).ready, {
    timeout: 150_000, intervals: [1000, 2000, 4000], message: 'Real evaluation must complete without a blocking checklist item',
  }).toBe(true)
  await json(`/api/ai/agents/${id}/activate`, 'POST')
  expect((await json(`/api/ai/agents/${id}`)).agent.status).toBe('active')
}

async function providerReply(since: string) {
  let messages: any[] = []
  await expect.poll(async () => {
    messages = await rows('messages', { conversation_id: `eq.${conversationId}`, direction: 'eq.outbound', created_at: `gte.${since}`, order: 'created_at.desc' })
    return messages.some(message => typeof message.provider_message_id === 'string' && message.provider_message_id.startsWith('wamid.'))
  }, { timeout: 120_000, intervals: [1000, 2000, 4000], message: 'Runtime must deliver an outbound message accepted by Meta' }).toBe(true)
  const activity = await rows('ai_runtime_activity', { conversation_id: `eq.${conversationId}` })
  expect(activity[0].last_judge_verdict).toBe('pass')
  return messages
}

test.describe.serial('AI candidate journeys on isolated staging', () => {
  test.beforeAll(async ({ playwright }) => {
    // globalSetup ran the fail-closed origin/revision preflight before this.
    api = await playwright.request.newContext({ baseURL: process.env.AI_E2E_APP_URL })
    await json('/api/auth', 'POST', { action: 'login', email: process.env.AI_E2E_EMAIL, password: process.env.AI_E2E_PASSWORD })
    const session = await json('/api/auth')
    expect(session.profile.organization_id).toBe(org)
    const accounts = await rows('whatsapp_business_accounts', { id: `eq.${accountId}`, select: 'id,organization_id,store_id,phone_number_id,waba_id,phone_number' })
    expect(accounts).toHaveLength(1)
    account = accounts[0]
    expect(account.store_id).toBe(store)
    expect(typeof account.phone_number_id).toBe('string')
    const rollout = await rows('ai_runtime_rollout')
    expect(rollout[0]?.mode, 'Dedicated test organization must use the candidate Python runtime').toBe('runtime')
    const owners = await rows('ai_agent_entries', { ref_id: `eq.${accountId}`, kind: 'eq.whatsapp_account', active: 'eq.true' })
    expect(owners, 'Test number must be unassigned before this run; never take an existing agent’s number').toHaveLength(0)
    const existing = await rows('whatsapp_cloud_conversations', { waba_id: `eq.${accountId}`, wa_id: `eq.${phone}`, select: 'id,organization_id,ai_enabled,ai_agent_id,ai_disabled_reason' })
    if (existing.length) {
      legacyId = existing[0].id
      originalBotState = { ai_enabled: existing[0].ai_enabled ?? true, ai_agent_id: existing[0].ai_agent_id, reason: existing[0].ai_disabled_reason }
      // Only the designated test recipient is reset, using the merchant's API.
      await json(`/api/whatsapp/inbox/conversations/${legacyId}/bot`, 'POST', { ai_enabled: true, ai_agent_id: null })
    }
  })

  test('IA-60 create, save, evaluate, activate and deliver an answer grounded in its source', async ({ page }) => {
    test.setTimeout(420_000)
    const created = await json('/api/ai/agents', 'POST', {
      template_id: 'vendas-whatsapp', name: `QA ${run}`, provider: 'openrouter',
      model: process.env.AI_E2E_MODEL || 'openai/gpt-4.1-mini',
    })
    agentId = created.agent.id
    agents.push(agentId)
    expect(created.agent.status).toBe('draft')
    settings = { ...created.agent.settings,
      behavior: { ...created.agent.settings?.behavior, cooldown_after_transfer: 0 },
      tools: { enabled: ['search_knowledge', 'transfer_to_human'] },
      safety: { ...created.agent.settings?.safety, handoff_keywords: ['quero uma pessoa'], handoff_confirmation_message: 'Uma pessoa continua o atendimento.', handoff_destination: null },
      delivery: { debounce_seconds: 3, split_bubbles: false, typing_rhythm: false },
    }
    await json(`/api/ai/agents/${agentId}`, 'PATCH', { settings, monthly_cap_usd: 1, system_prompt: `${created.agent.system_prompt}\nUse somente as fontes da loja para responder prazos.` })
    expect((await json(`/api/ai/agents/${agentId}`)).agent.monthly_cap_usd).toBe(1)
    const beforeFields = (await json(`/api/ai/agents/${agentId}`)).agent
    const beforeVersions = (await json(`/api/ai/agents/${agentId}/versions`)).versions
    await json(`/api/ai/agents/${agentId}`, 'PATCH', { presentation_mode: 'discreta', client_adaptation: { mirror_tone: false } })
    const changedVersions = (await json(`/api/ai/agents/${agentId}/versions`)).versions
    expect(changedVersions.length).toBe(beforeVersions.length + 1)
    await json(`/api/ai/agents/${agentId}/versions/${beforeVersions[0].id}/restore`, 'POST')
    const restoredFields = (await json(`/api/ai/agents/${agentId}`)).agent
    expect(restoredFields.presentation_mode).toBe(beforeFields.presentation_mode)
    expect(restoredFields.client_adaptation).toEqual(beforeFields.client_adaptation)
    expect((await json(`/api/ai/agents/${agentId}/versions`)).versions.length).toBe(beforeVersions.length + 2)
    await json(`/api/ai/agents/${agentId}/entries`, 'POST', { kind: 'whatsapp_account', ref_id: accountId })
    const note = await json('/api/ai/knowledge', 'POST', { name: `Política QA ${run}`, folder: 'QA', agent_ids: [agentId], body_markdown: `O prazo de troca do produto QA ${run} é de 37 dias corridos após o recebimento.` })
    sourceId = note.note.id
    sources.push(sourceId)
    await expect.poll(async () => (await json(`/api/ai/knowledge/${sourceId}`)).note.status, { timeout: 90_000, intervals: [1000, 2000, 4000] }).toBe('ready')
    const missions = await json(`/api/ai/missions?agent_id=${agentId}`)
    expect(missions.missions.every((mission: any) => mission.agent_id !== agentId || mission.event_type === 'whatsapp.received')).toBe(true)
    const mission = missions.missions.find((item: any) => item.agent_id === agentId && item.event_type === 'whatsapp.received')
    expect(mission).toBeTruthy()
    await json(`/api/ai/missions/${mission.id}`, 'PATCH', { status: 'active' })
    await readyAndActivate(agentId)
    const savedBeforePreview = (await json(`/api/ai/agents/${agentId}`)).agent
    const preview = await json(`/api/ai/agents/${agentId}/simulate`, 'POST', {
      message: 'Qual é a cor oficial definida para este rascunho?',
      agent_draft: { system_prompt: `Você atende a loja em português. A cor oficial deste rascunho de teste é violeta. Quando perguntarem a cor, informe violeta de forma direta. Identificador QA ${run}.` },
      event_type: 'whatsapp.received', contact_profile: { kind: 'novo', name: 'Cliente QA' },
    })
    expect(preview.blocked).toBe(false)
    expect(preview.reply).toMatch(/violeta/i)
    expect(preview.attempts.length).toBeGreaterThan(0)
    const savedAfterPreview = (await json(`/api/ai/agents/${agentId}`)).agent
    expect(savedAfterPreview.system_prompt).toBe(savedBeforePreview.system_prompt)
    await page.context().addCookies((await api.storageState()).cookies)
    await page.goto(`/ai/construtor/${agentId}`)
    await expect(page.getByRole('switch', { name: 'Ativo' })).toHaveAttribute('aria-checked', 'true')
    const since = new Date().toISOString()
    await inbound(`Qual o prazo de troca do produto QA ${run}?`)
    let usage: any
    await expect.poll(async () => { usage = await json(`/api/ai/knowledge/${sourceId}/usage`); return usage.questions?.length ?? 0 }, { timeout: 120_000, intervals: [1000, 2000, 4000] }).toBeGreaterThan(0)
    conversationId = usage.questions[0].conversation_id
    const legacy = await rows('whatsapp_cloud_conversations', { waba_id: `eq.${accountId}`, wa_id: `eq.${phone}` })
    expect(legacy).toHaveLength(1)
    legacyId = legacy[0].id
    const answer = await providerReply(since)
    expect(answer.some(message => /\b37\b/.test(message.content?.text ?? ''))).toBe(true)
  })

  test('IA-62 unanswered question becomes a gap, is answered in a note and retrieves the new source', async () => {
    test.setTimeout(360_000)
    // Ensure a real no-source retrieval, independent of embedding similarity
    // to the 37-day policy. Only this run's reader relation is changed.
    await json(`/api/ai/knowledge/${sourceId}/agents`, 'PUT', { agent_ids: [] })
    await json(`/api/ai/agents/${agentId}`, 'PATCH', { settings: { ...settings, tools: { enabled: ['search_knowledge'] } } })
    const question = `Qual o prazo de garantia especial QA ${run}?`
    const unansweredSince = new Date().toISOString()
    await inbound(question)
    let gap: any
    await expect.poll(async () => {
      const candidates = await rows('ai_knowledge_gaps', { status: 'eq.open', agent_ids: `cs.{${agentId}}`, order: 'last_seen.desc' })
      gap = candidates.find(item => item.question?.includes(run))
      return Boolean(gap)
    }, { timeout: 120_000, intervals: [1000, 2000, 4000] }).toBe(true)
    await providerReply(unansweredSince)
    await json(`/api/ai/agents/${agentId}`, 'PATCH', { settings })
    await json(`/api/ai/knowledge/${sourceId}/agents`, 'PUT', { agent_ids: [agentId] })
    await json(`/api/ai/knowledge/gaps/${gap.id}/resolve`, 'POST', { action: 'append_to', source_id: sourceId, answer: `A garantia especial QA ${run} é de 83 dias.` })
    await expect.poll(async () => (await json(`/api/ai/knowledge/${sourceId}`)).note.status, { timeout: 90_000, intervals: [1000, 2000, 4000] }).toBe('ready')
    expect((await rows('ai_knowledge_gaps', { id: `eq.${gap.id}` }))[0].status).toBe('resolved')
    const since = new Date().toISOString()
    await inbound(question)
    const answer = await providerReply(since)
    expect(answer.some(message => /\b83\b/.test(message.content?.text ?? ''))).toBe(true)
    const retrievals = await rows('ai_runtime_activity_tools', { conversation_id: `eq.${conversationId}`, tool_name: 'eq.search_knowledge', created_at: `gte.${since}` })
    expect(retrievals.some(row => row.output?.chunks?.some((chunk: any) => chunk.source_id === sourceId && chunk.content?.includes('83 dias')))).toBe(true)
  })

  test('IA-61 model tool routes to an active specialist and falls back to the team when paused', async () => {
    test.setTimeout(420_000)
    const created = await json('/api/ai/agents', 'POST', {
      template_id: 'vendas-whatsapp', name: `Especialista QA ${run}`, provider: 'openrouter',
      model: process.env.AI_E2E_MODEL || 'openai/gpt-4.1-mini',
    })
    const destination = created.agent.id
    agents.push(destination)
    await json(`/api/ai/agents/${destination}`, 'PATCH', { monthly_cap_usd: 1,
      settings: { ...created.agent.settings, behavior: { ...created.agent.settings?.behavior, cooldown_after_transfer: 0 } },
    })
    const missions = await json(`/api/ai/missions?agent_id=${destination}`)
    const mission = missions.missions.find((item: any) => item.agent_id === destination && item.event_type === 'whatsapp.received')
    expect(mission).toBeTruthy()
    await json(`/api/ai/missions/${mission.id}`, 'PATCH', { status: 'active' })
    await readyAndActivate(destination)
    const original = (await json(`/api/ai/agents/${agentId}`)).agent.system_prompt
    const transferSettings = { ...settings, safety: { ...settings.safety, handoff_destination: destination } }
    await json(`/api/ai/agents/${agentId}`, 'PATCH', {
      settings: transferSettings,
      system_prompt: `${original}\nAo receber o código ROTEAR-QA, execute transfer_to_human com reason=other e um resumo do pedido. Não responda a pergunta por conta própria.`,
    })
    const first = new Date().toISOString()
    await inbound(`ROTEAR-QA: encaminhe meu caso ao especialista. Execução ${run}`)
    await expect.poll(async () => (await rows('ai_runtime_activity_tools', {
      conversation_id: `eq.${conversationId}`, tool_name: 'eq.transfer_to_human', success: 'eq.true', created_at: `gte.${first}`,
    })).some(tool => tool.output?.transferred === true && tool.output?.routed === 'agent'), { timeout: 120_000, intervals: [1000, 2000] }).toBe(true)
    await expect.poll(async () => (await rows('conversations', { id: `eq.${conversationId}` }))[0]?.agent_id, { timeout: 30_000 }).toBe(destination)
    await expect.poll(async () => (await rows('conversations', { id: `eq.${conversationId}` }))[0]?.processing_token, { timeout: 60_000 }).toBeNull()
    await json(`/api/ai/agents/${destination}/pause`, 'POST')
    const second = new Date().toISOString()
    await inbound(`ROTEAR-QA: encaminhe meu caso novamente. Execução ${run}`)
    await expect.poll(async () => (await rows('ai_runtime_activity_tools', {
      conversation_id: `eq.${conversationId}`, tool_name: 'eq.transfer_to_human', success: 'eq.true', created_at: `gte.${second}`,
    })).some(tool => tool.output?.transferred === true && tool.output?.routed !== 'agent' && tool.output?.mirrored === true), { timeout: 120_000, intervals: [1000, 2000] }).toBe(true)
    expect((await rows('whatsapp_cloud_conversations', { id: `eq.${legacyId}` }))[0].ai_enabled).toBe(false)
    await expect.poll(async () => (await rows('conversations', { id: `eq.${conversationId}` }))[0]?.processing_token, { timeout: 60_000 }).toBeNull()
    await json(`/api/whatsapp/inbox/conversations/${legacyId}/bot`, 'POST', { ai_enabled: true, ai_agent_id: agentId })
    await json(`/api/ai/agents/${agentId}`, 'PATCH', { settings, system_prompt: original })
  })

  test('IA-61 asking for a person transfers to Inbox and prevents further AI replies', async ({ page }) => {
    const transferredSince = new Date().toISOString()
    await inbound('quero uma pessoa')
    await expect.poll(async () => (await rows('whatsapp_cloud_conversations', { id: `eq.${legacyId}` }))[0]?.ai_enabled, { timeout: 60_000, intervals: [1000, 2000] }).toBe(false)
    await page.context().addCookies((await api.storageState()).cookies)
    const thread = (await rows('conversations', { id: `eq.${conversationId}` }))[0]
    await page.goto(`/whatsapp/inbox?contact=${encodeURIComponent(thread.contact_id)}`)
    await expect(page.getByText('quero uma pessoa', { exact: true }).last()).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Bot|Agente .+) Off$/ })).toBeVisible()
    // Correlate this turn's deterministic handoff confirmation and Meta receipt.
    await expect.poll(async () => {
      const confirmation = await rows('messages', { conversation_id: `eq.${conversationId}`, direction: 'eq.outbound', created_at: `gte.${transferredSince}` })
      return confirmation.some(message => message.content?.text === settings.safety.handoff_confirmation_message && message.provider_message_id?.startsWith('wamid.'))
    }, { timeout: 120_000, intervals: [1000, 2000, 4000] }).toBe(true)
    const since = new Date().toISOString()
    await inbound(`Ainda tem alguém aí? QA ${run}`)
    await expect.poll(async () => (await rows('whatsapp_ai_run_steps', {
      conversation_id: `eq.${legacyId}`, step: 'eq.skipped', created_at: `gte.${since}`,
    })).some(step => step.metadata?.runtime === true && step.detail?.includes('Agente desativado')), {
      timeout: 30_000, intervals: [1000], message: 'Webhook must persist its AI-disabled cancellation for the new inbound',
    }).toBe(true)
    // A null debounce alone can mean "worker started". Observe cancellation,
    // no active processing lease, and no outbound through the scheduling window.
    const observeUntil = Date.now() + 15_000
    await expect.poll(async () => {
      const state = (await rows('conversations', { id: `eq.${conversationId}`, select: 'organization_id,pending_response_at,processing_token' }))[0]
      expect(await rows('messages', { conversation_id: `eq.${conversationId}`, direction: 'eq.outbound', created_at: `gte.${since}` })).toHaveLength(0)
      return state?.pending_response_at === null && state?.processing_token === null && Date.now() >= observeUntil
    }, { timeout: 30_000, intervals: [1000] }).toBe(true)
  })

  test.afterAll(async () => {
    if (!api) return
    const failures: string[] = []
    async function clean(path: string, method: string, data?: unknown) {
      try {
        const response = await api.fetch(path, { method, data })
        if (!response.ok()) failures.push(`${method} ${path}: ${response.status()}`)
        return response
      } catch { failures.push(`${method} ${path}: unavailable`) }
    }
    // Only IDs allocated by this run are ever removed. Existing accounts,
    // contacts, history and organization settings are retained for diagnosis.
    for (const id of agents) {
      await clean(`/api/ai/agents/${id}/pause`, 'POST')
      const response = await clean(`/api/ai/agents/${id}/entries`, 'GET')
      if (response?.ok()) for (const entry of (await response.json()).entries ?? []) {
        if (entry.kind === 'whatsapp_account' && entry.ref_id === accountId) await clean(`/api/ai/agents/${id}/entries?entry_id=${entry.id}`, 'DELETE')
      }
    }
    for (const id of sources) await clean(`/api/ai/knowledge/${id}`, 'DELETE')
    for (const id of agents) await clean(`/api/ai/agents/${id}`, 'DELETE')
    if (legacyId) {
      const path = `/api/whatsapp/inbox/conversations/${legacyId}/bot`
      const original = originalBotState ?? { ai_enabled: true, ai_agent_id: null }
      // Assignment enables AI by contract; apply the initial enabled flag last.
      await clean(path, 'POST', { ai_agent_id: original.ai_agent_id })
      await clean(path, 'POST', { ai_enabled: original.ai_enabled, reason: original.reason })
      const check = await clean(path, 'GET')
      if (check?.ok()) {
        const state = await check.json()
        if (state.ai_enabled !== original.ai_enabled || state.ai_agent_id !== original.ai_agent_id) failures.push('QA bot state was not restored')
      }
    }
    await api.dispose()
    expect(failures, 'Run-owned staging cleanup must succeed').toEqual([])
  })
})
