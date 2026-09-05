import { describe, expect, it, vi } from 'vitest'

const { callAIWithTools } = vi.hoisted(() => ({ callAIWithTools: vi.fn() }))
vi.mock('@/lib/whatsapp/ai-providers', () => ({ callAIWithTools }))
import { runToolLoop } from './loop'

describe('runToolLoop custo factual', () => {
  it('soma custo apenas quando toda rodada o informou', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'missing', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.1 } })
      .mockResolvedValueOnce({ content: 'fim', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context: {} } as any)
    expect((result as any).costUsd).toBeNull()
  })
})
