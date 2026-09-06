import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(() => ({ insert })) } }))

import { trackAiUsage } from '../cost-tracker'
import { callAI } from '@/lib/whatsapp/ai-providers'

describe('OpenRouter usage ausente', () => {
  beforeEach(() => {
    insert.mockClear()
    insert.mockResolvedValue({ data: null, error: null })
  })

  it('mantém contador parcial e custo desconhecido até o tracker', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10 } }),
    }))
    const response = await callAI({ provider: 'openrouter', apiKey: 'key', model: 'openai/gpt-4o-mini' }, [{ role: 'user', content: 'oi' }])
    await trackAiUsage({ organizationId: 'org', provider: 'openrouter', model: 'openai/gpt-4o-mini', feature: 'eval_judge', promptTokens: response.usage?.promptTokens, completionTokens: response.usage?.completionTokens, costUsdOverride: response.usage?.costUsd })
    expect(insert.mock.calls[0][0].cost_usd).toBeNull()
  })

  it('preserva zero factual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 } }),
    }))
    const response = await callAI({ provider: 'openrouter', apiKey: 'key', model: 'openai/gpt-4o-mini' }, [{ role: 'user', content: 'oi' }])
    await trackAiUsage({ organizationId: 'org', provider: 'openrouter', model: 'openai/gpt-4o-mini', feature: 'eval_judge', promptTokens: response.usage?.promptTokens, completionTokens: response.usage?.completionTokens, costUsdOverride: response.usage?.costUsd })
    expect(insert.mock.calls[0][0].cost_usd).toBe(0)
  })
})
