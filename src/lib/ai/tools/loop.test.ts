import { beforeEach, describe, expect, it, vi } from 'vitest'

const { callAIWithTools } = vi.hoisted(() => ({ callAIWithTools: vi.fn() }))
vi.mock('@/lib/whatsapp/ai-providers', () => ({ callAIWithTools }))
import { runToolLoop } from './loop'
import { clearBudgetCache } from '../budget'

// These aggregation fixtures keep the monthly DB snapshot below budget;
// budget-accounting.test.ts composes persistence and fresh reads statefully.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'ai_usage_logs') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      if (table !== 'ai_budgets') throw new Error(`Unexpected table: ${table}`)
      return { select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { monthly_limit_usd: 50 }, error: null }),
      }) }) }
    }),
    rpc: vi.fn().mockResolvedValue({ data: [{ spent_usd: 0, has_unknown_cost: false }], error: null }),
  },
}))
const context = { organizationId: 'org', conversationId: 'conversation', agentId: 'agent', phone: 'phone', accountId: 'account' }
beforeEach(() => {
  clearBudgetCache()
  callAIWithTools.mockReset()
})

describe('runToolLoop custo factual', () => {
  it('deixa override ausente quando provider não informa custo factual', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: 'fim', toolCalls: [], usage: { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context } as any)
    expect((result as any).costUsd).toBeUndefined()
  })

  it('soma custo apenas quando toda rodada o informou', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'missing', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.1 } })
      .mockResolvedValueOnce({ content: 'fim', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context } as any)
    expect((result as any).costUsd).toBeNull()
  })

  it('invalida soma factual se a rodada seguinte falhar', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'missing', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.123 } })
      .mockRejectedValueOnce(new Error('transport failed'))
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context } as any)
    expect((result as any).costUsd).toBeNull()
  })

  it('nao aceita custo tardio como total quando uma rodada anterior nao o informou', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'missing', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } })
      .mockResolvedValueOnce({ content: 'fim', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.123 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context } as any)
    expect(result.costUsd).toBeNull()
  })

  it('preserva contagem parcial como ausente para o tracker', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: 'fim', toolCalls: [], usage: { completionTokens: 2, totalTokens: 2 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context } as any)
    expect(result.promptTokens).toBeUndefined()
    expect(result.completionTokens).toBe(2)
  })

  it('marca custo desconhecido se a primeira chamada falhar', async () => {
    callAIWithTools.mockRejectedValueOnce(new Error('transport failed'))
    const result = await runToolLoop({ providerConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context } as any)
    expect(result.costUsd).toBeNull()
    expect(result.promptTokens).toBeUndefined()
    expect(result.completionTokens).toBeUndefined()
  })

  it('nao inventa contagens zero quando o cap impede a primeira chamada', async () => {
    const result = await runToolLoop({ providerConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context, caps: { maxTokens: 0 } } as any)
    expect(result.promptTokens).toBeUndefined()
    expect(result.completionTokens).toBeUndefined()
  })

  it('preserva a soma factual de rodadas concluidas quando o cap impede a proxima chamada', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'missing', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.125 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context, caps: { maxTokens: 2 } } as any)
    expect(result).toMatchObject({ stoppedBy: 'max_tokens', costUsd: 0.125 })
  })

  it('preserva zero factual no rate limit', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [], rateLimited: true, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context } as any)
    expect(result).toMatchObject({ stoppedBy: 'rate_limited', costUsd: 0 })
  })

  it('soma rodadas completas', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'missing', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.1 } })
      .mockResolvedValueOnce({ content: 'fim', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.2 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context } as any)
    expect(result.costUsd).toBeCloseTo(0.3)
  })

  it('preserva custo factual ao parar por controle', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'stop', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.1 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [{ name: 'stop', description: 'stop', inputSchema: {}, handler: async () => ({ ok: true, control: { stop: true } }) }], context } as any)
    expect(result).toMatchObject({ stoppedBy: 'control_stop', costUsd: 0.1 })
  })
})
