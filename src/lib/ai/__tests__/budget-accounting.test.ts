import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'
import { checkAiBudget, clearBudgetCache } from '../budget'
import { trackAiUsage } from '../cost-tracker'
import { generateEmbeddingsBatch } from '../embeddings'
import { AIAgentEngine } from '../engine'
import { runEvaluation } from '../evals'
import { runToolLoop } from '../tools/loop'
import { DEFAULT_PERSONA, DEFAULT_SETTINGS } from '../types'

// Compose the real budget, tracker and embedding modules; only IO is replaced.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}))
vi.mock('@/lib/redis', () => ({
  isRedisConfigured: () => false,
  getRedis: vi.fn(),
  CACHE_PREFIX: { EMBEDDING: 'embedding:' },
  CACHE_TTL: { EMBEDDING: 3600 },
}))

interface UsageRow {
  organization_id: string
  cost_usd: number | null
  metadata: { billable?: boolean }
}

let rows: UsageRow[]
let insertError: { message: string } | null
const insert = vi.fn(async (row: UsageRow) => {
  if (!insertError) rows.push(row)
  return { error: insertError }
})

function makeAgent(provider = 'openai') {
  return {
      id: 'agent-a', organization_id: 'org-a', name: 'Agent',
      provider, model: 'gpt-4o-mini', temperature: 0, max_tokens: 100,
      is_active: true, persona: DEFAULT_PERSONA, settings: DEFAULT_SETTINGS,
      total_messages: 0, total_conversations: 0, total_tokens_used: 0,
      created_at: '2026-09-01', updated_at: '2026-09-01',
  }
}

function makeEngine(agent = makeAgent()) {
  return new AIAgentEngine({
    organizationId: 'org-a', apiKey: 'test-chat-key', agent,
  })
}

function query(data: unknown, count = 0): any {
  const result = { data, count, error: null }
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    maybeSingle: async () => result,
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearBudgetCache()
  rows = []
  insertError = null
  vi.mocked(createClient).mockReturnValue(supabaseAdmin as any)
  ;(supabaseAdmin as any).from = vi.fn((table: string) => {
    if (table === 'ai_usage_logs') return { insert }
    if (table === 'organization_api_keys') return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: async () => ({ data: { api_key: 'test-embedding-key' }, error: null }),
    }
    if (table !== 'ai_budgets') throw new Error(`Unexpected table: ${table}`)
    return {
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { monthly_limit_usd: 0.01 }, error: null }),
      }) }),
    }
  })
  ;(supabaseAdmin as any).rpc = vi.fn(async (name: string, args: { p_organization_id: string }) => {
    if (name === 'search_agent_knowledge') return { data: [], error: null }
    if (name === 'update_agent_stats') return { data: null, error: null }
    if (name !== 'ai_monthly_cost_usd') throw new Error(`Unexpected RPC: ${name}`)
    const billableRows = rows.filter(row =>
      row.organization_id === args.p_organization_id && row.metadata.billable !== false,
    )
    return { data: [{
      spent_usd: billableRows.reduce((sum, row) => sum + (row.cost_usd ?? 0), 0),
      has_unknown_cost: billableRows.some(row => row.cost_usd === null),
    }], error: null }
  })
})

afterEach(() => {
  clearBudgetCache()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('engine revalidates after billable RAG work', () => {
  it.each(['inactive', 'schedule', 'prompt'])('does not log a pre-provider %s failure', async failure => {
    const agent = makeAgent()
    if (failure === 'inactive') agent.is_active = false
    if (failure === 'schedule') agent.settings = {
      ...agent.settings, schedule: { ...agent.settings.schedule, always_active: false, days: [] },
    }
    if (failure === 'prompt') agent.persona = undefined as any
    const baseFrom = (supabaseAdmin as any).from.getMockImplementation()
    ;(supabaseAdmin as any).from = vi.fn((table: string) =>
      table === 'organization_api_keys' ? query(null) : baseFrom(table),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(makeEngine(agent).processMessage({
      conversationId: 'conversation-a', conversationHistory: [{ role: 'user', content: 'question' }],
    })).rejects.toBeInstanceOf(Error)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
    expect(rows).toHaveLength(0)
  })

  it.each(['provider', 'stats'])('records once for a simple request followed by %s failure', async failure => {
    const baseFrom = (supabaseAdmin as any).from.getMockImplementation()
    ;(supabaseAdmin as any).from = vi.fn((table: string) =>
      table === 'organization_api_keys' ? query(null) : baseFrom(table),
    )
    const error = new Error(`${failure} failed`)
    const fetchMock = failure === 'provider' ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        choices: [{ message: { content: 'answer' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    if (failure === 'stats') {
      const baseRpc = (supabaseAdmin as any).rpc.getMockImplementation()
      ;(supabaseAdmin as any).rpc = vi.fn(async (name: string, args: unknown) => {
        if (name === 'update_agent_stats') throw error
        return baseRpc(name, args)
      })
    }

    await expect(makeEngine().processMessage({
      conversationId: 'conversation-a', conversationHistory: [{ role: 'user', content: 'question' }],
    })).rejects.toBe(error)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      cost_usd: failure === 'provider' ? null : expect.any(Number),
      success: failure !== 'provider', metadata: { billable: true },
    })
  })

  it.each([
    { useTools: false, hasUsage: false },
    { useTools: true, hasUsage: false },
    { useTools: false, hasUsage: true },
    { useTools: true, hasUsage: true },
  ])('rechecks before LLM (tools=$useTools, RAG usage=$hasUsage)', async ({ useTools, hasUsage }) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/embeddings')) return {
        ok: true, json: async () => ({
          data: [{ embedding: [1] }],
          ...(hasUsage ? { usage: { prompt_tokens: 50 } } : {}),
        }),
      }
      if (!url.endsWith('/chat/completions')) throw new Error(`Unexpected request: ${url}`)
      return { ok: true, json: async () => ({
        choices: [{ message: { content: 'answer' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const engine = makeEngine()

    const outcome = await engine.processMessage({
      conversationId: 'conversation-a', conversationHistory: [{ role: 'user', content: 'question' }],
      ...(useTools ? { toolContext: {
        organizationId: 'org-a', conversationId: 'conversation-a',
        phone: 'test-phone', accountId: 'account-a', agentId: 'agent-a',
      } } : {}),
    }).then(result => result, error => error)

    expect(rows[0]).toMatchObject({
      organization_id: 'org-a', cost_usd: hasUsage ? 0.000001 : null, metadata: { billable: true },
    })
    expect(rows).toHaveLength(hasUsage ? 2 : 1)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.openai.com/v1/embeddings',
      ...(hasUsage ? ['https://api.openai.com/v1/chat/completions'] : []),
    ])
    if (hasUsage) {
      expect(outcome).toMatchObject({ response: 'answer' })
      expect(rows.every(row => row.metadata.billable === true)).toBe(true)
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('update_agent_stats', expect.objectContaining({ p_tokens: 2 }))
    }
    else expect(outcome).toMatchObject({ status: 503, unknownReason: 'unpriced_model' })
  })

  it.each([
    { cost: null, status: 503 },
    { cost: 0.02, status: 402 },
  ])('creates no request or usage when the initial gate blocks with $status', async ({ cost, status }) => {
    rows.push({ organization_id: 'org-a', cost_usd: cost, metadata: { billable: true } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(makeEngine().processMessage({
      conversationId: 'conversation-a', conversationHistory: [{ role: 'user', content: 'question' }],
    })).rejects.toMatchObject({ status })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
    expect(rows).toHaveLength(1) // Only the preexisting monthly usage.
  })
})

describe('tool-loop accounts each issued round', () => {
  const params = {
    providerConfig: { provider: 'openrouter' as const, apiKey: 'test-key', model: 'openai/gpt-4o-mini', systemPrompt: 'system' },
    messages: [{ role: 'user' as const, content: 'question' }], tools: [],
    context: { organizationId: 'org-a', conversationId: 'conversation-a', phone: 'test-phone', accountId: 'account-a', agentId: 'agent-a' },
  }

  it.each([
    { label: 'missing usage', usage: undefined, cost: null, status: 503 },
    { label: 'limit reached', usage: { cost: 0.01 }, cost: 0.01, status: 402 },
    { label: 'under budget', usage: { cost: 0.001 }, cost: 0.001, status: 200 },
  ])('rechecks after $label', async ({ usage, cost, status }) => {
    let round = 0
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({
      choices: [{ message: ++round === 1
        ? { content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'missing', arguments: '{}' } }] }
        : { content: 'answer' } }],
      ...(usage ? { usage } : {}),
    }) }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await runToolLoop(params).then(result => result, error => error)

    expect(fetchMock).toHaveBeenCalledTimes(status === 200 ? 2 : 1)
    expect(rows).toHaveLength(status === 200 ? 2 : 1)
    expect(rows[0]).toMatchObject({ cost_usd: cost, metadata: { billable: true } })
    if (status === 200) expect(outcome).toMatchObject({ text: 'answer', costUsd: 0.002 })
    else expect(outcome).toMatchObject({ status })
  })

  it.each(['transport', '429'])('records one NULL for an issued %s failure', async failure => {
    const fetchMock = vi.fn(async () => {
      if (failure === 'transport') throw new Error('provider unavailable')
      return { ok: false, status: 429, json: async () => ({ error: { message: 'rate limit' } }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runToolLoop(params)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ cost_usd: null, success: false, metadata: { billable: true } })
    expect(result.stoppedBy).toBe(failure === '429' ? 'rate_limited' : 'final')
  })

  it('initial budget block creates neither provider request nor usage', async () => {
    rows.push({ organization_id: 'org-a', cost_usd: null, metadata: { billable: true } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runToolLoop(params)).rejects.toMatchObject({ status: 503 })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it.each([
    { hasUsage: false, statsFail: false },
    { hasUsage: true, statsFail: false },
    { hasUsage: true, statsFail: true },
  ])('engine search_knowledge accounts between rounds (usage=$hasUsage, stats fail=$statsFail)', async ({ hasUsage, statsFail }) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
    let chatRound = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/embeddings')) return { ok: true, json: async () => ({
        data: [{ embedding: [1] }], ...(hasUsage ? { usage: { prompt_tokens: 50 } } : {}),
      }) }
      if (!url.endsWith('/chat/completions')) throw new Error(`Unexpected request: ${url}`)
      return { ok: true, json: async () => ({
        choices: [{ message: ++chatRound === 1
          ? { content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"question"}' } }] }
          : { content: 'answer' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const statsError = new Error('stats failed after issued rounds')
    if (statsFail) {
      const baseRpc = (supabaseAdmin as any).rpc.getMockImplementation()
      ;(supabaseAdmin as any).rpc = vi.fn(async (name: string, args: unknown) => {
        if (name === 'update_agent_stats') throw statsError
        return baseRpc(name, args)
      })
    }
    const agent = makeAgent()
    agent.settings = { ...agent.settings, tools: { enabled: ['search_knowledge'] } }

    const outcome = await makeEngine(agent).processMessage({
      conversationId: 'conversation-a', conversationHistory: params.messages, toolContext: params.context,
    }).then(result => result, error => error)

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.openai.com/v1/chat/completions', 'https://api.openai.com/v1/embeddings',
      ...(hasUsage ? ['https://api.openai.com/v1/chat/completions'] : []),
    ])
    expect(rows).toHaveLength(hasUsage ? 3 : 2)
    expect(rows[0]).toMatchObject({ feature: 'whatsapp_agent', metadata: { billable: true } })
    expect(rows[1]).toMatchObject({ feature: 'embedding', cost_usd: hasUsage ? 0.000001 : null, metadata: { billable: true } })
    if (hasUsage) {
      if (statsFail) expect(outcome).toBe(statsError)
      else expect(outcome).toMatchObject({ response: 'answer', tokens_used: 10, stopped_by: 'final', tool_calls: [{ name: 'search_knowledge' }] })
      const stats = (supabaseAdmin as any).rpc.mock.calls.filter(([name]: string[]) => name === 'update_agent_stats')
      expect(stats).toHaveLength(1)
      expect(stats[0][1]).toMatchObject({ p_tokens: 10 })
    } else expect(outcome).toMatchObject({ status: 503, unknownReason: 'unpriced_model' })
  })
})

describe('billable persistence invalidates the real budget cache', () => {
  it.each([
    { label: 'missing usage', usage: undefined, cost: null, status: 503 },
    { label: 'known cost', usage: { prompt_tokens: 1_000_000 }, cost: 0.02, status: 402 },
  ])('blocks the second request of 101 texts after $label', async ({ usage, cost, status }) => {
    const otherOrgBudget = await checkAiBudget('org-b')
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const { input } = JSON.parse(init.body) as { input: string[] }
      return { ok: true, json: async () => ({
        data: input.map((_text, index) => ({ index, embedding: [index] })),
        ...(usage ? { usage } : {}),
      }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const error = await generateEmbeddingsBatch(
      Array.from({ length: 101 }, (_, index) => `text ${index}`), 'test-key', 'org-a',
    ).then(() => undefined, error => error)

    expect(rows[0]).toMatchObject({
      organization_id: 'org-a', cost_usd: cost, metadata: { billable: true },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(1)
    expect(error).toMatchObject({ status })
    if (status === 503) expect(error.unknownReason).toBe('unpriced_model')
    expect(await checkAiBudget('org-b')).toBe(otherOrgBudget)
    expect((supabaseAdmin as any).rpc.mock.calls.map(([, args]: any[]) => args.p_organization_id))
      .toEqual(['org-b', 'org-a', 'org-a'])
  })

  it('refreshes legacy billable usage without metadata', async () => {
    await checkAiBudget('org-a')

    await trackAiUsage({
      organizationId: 'org-a', provider: 'openai', model: 'gpt-4o-mini',
      feature: 'whatsapp_agent', costUsdOverride: 0.02,
    })

    expect(await checkAiBudget('org-a')).toMatchObject({ allowed: false, spentUsd: 0.02 })
  })

  it.each(['non-billable', 'failed insert'])('preserves cache after %s', async reason => {
    const cached = await checkAiBudget('org-a')
    if (reason === 'failed insert') insertError = { message: 'insert refused' }

    await trackAiUsage({
      organizationId: 'org-a', provider: 'openai', model: 'text-embedding-3-small',
      feature: 'embedding', costUsdOverride: null,
      metadata: { billable: reason !== 'non-billable' },
    })

    expect(await checkAiBudget('org-a')).toBe(cached)
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(reason === 'failed insert' ? 0 : 1)
  })
})

describe('evals account before each following judge request', () => {
  it.each([
    { label: 'missing usage', usage: undefined, cost: null, status: 503, fail: false },
    { label: 'limit reached', usage: { cost: 0.01 }, cost: 0.01, status: 402, fail: false },
    { label: 'provider failure', usage: undefined, cost: null, status: 503, fail: true },
    { label: 'factual zero', usage: { cost: 0 }, cost: 0, status: 200, fail: false },
  ])('rechecks after $label', async ({ usage, cost, status, fail }) => {
    const baseFrom = (supabaseAdmin as any).from.getMockImplementation()
    const baseRpc = (supabaseAdmin as any).rpc.getMockImplementation()
    const resultInsert = vi.fn().mockResolvedValue({ error: null })
    const evalTraceQuery = () => {
      let selected = ''
      const chain: any = {
        select: vi.fn((fields: string) => {
          selected = fields
          return chain
        }),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        maybeSingle: async () => ({ data: { output: 'stored answer' }, error: null }),
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve({
            data: selected === 'id' ? [{ id: 'trace-1' }, { id: 'trace-2' }] : [],
            error: null,
          }).then(resolve),
      }
      return chain
    }
    ;(supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'ai_eval_criteria') return query([{ id: 'criterion', label: 'Relevant' }], 1)
      if (table === 'agent_trace_annotations' || table === 'ai_test_scenarios') return query([])
      if (table === 'agent_traces') return evalTraceQuery()
      if (table === 'ai_agent_versions') return query(null)
      if (table === 'ai_eval_results') return { insert: resultInsert }
      return baseFrom(table)
    })
    ;(supabaseAdmin as any).rpc = vi.fn((name: string, args: unknown) => {
      if (name === 'list_eligible_eval_cases') {
        return Promise.resolve({
          data: [1, 2].map(id => ({
            id: `case-${id}`,
            input: 'question',
            source: 'annotation',
            source_id: `trace-${id}`,
          })),
          error: null,
        })
      }
      return baseRpc(name, args)
    })
    const fetchMock = vi.fn(async () => {
      if (fail) throw new Error('provider unavailable')
      return { ok: true, json: async () => ({
        choices: [{ message: { content: JSON.stringify({ score: 80, verdict: 'pass', criteria: [] }) } }],
        ...(usage ? { usage } : {}),
      }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const error = await runEvaluation(supabaseAdmin as any, makeAgent('openrouter'), 'org-a', null)
      .then(() => undefined, error => error)

    expect(rows[0]?.cost_usd).toBe(cost)
    expect(fetchMock).toHaveBeenCalledTimes(status === 200 ? 2 : 1)
    expect(rows).toHaveLength(status === 200 ? 2 : 1)
    expect(rows.every(row => row.metadata.billable === true)).toBe(true)
    expect(resultInsert).toHaveBeenCalledTimes(status === 200 ? 2 : 1)
    if (fail) expect(resultInsert.mock.calls[0][0]).toMatchObject({ verdict: 'fail', score: 0 })
    if (status === 200) expect(error).toBeUndefined()
    else expect(error).toMatchObject({ status })
  })
})
