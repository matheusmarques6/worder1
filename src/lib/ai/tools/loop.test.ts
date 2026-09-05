import { describe, expect, it, vi } from 'vitest'

const { callAIWithTools } = vi.hoisted(() => ({ callAIWithTools: vi.fn() }))
vi.mock('@/lib/whatsapp/ai-providers', () => ({ callAIWithTools }))
import { runToolLoop } from './loop'

describe('runToolLoop custo factual', () => {
  it('deixa override ausente quando provider não informa custo factual', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: 'fim', toolCalls: [], usage: { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4o-mini', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context: {} } as any)
    expect((result as any).costUsd).toBeUndefined()
  })

  it('soma custo apenas quando toda rodada o informou', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'missing', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.1 } })
      .mockResolvedValueOnce({ content: 'fim', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } })
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context: {} } as any)
    expect((result as any).costUsd).toBeNull()
  })

  it('invalida soma factual se a rodada seguinte falhar', async () => {
    callAIWithTools.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'missing', args: {} }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.123 } })
      .mockRejectedValueOnce(new Error('transport failed'))
    const result = await runToolLoop({ providerConfig: { provider: 'openrouter', apiKey: 'key', model: 'google/new-model', systemPrompt: 'system' }, messages: [{ role: 'user', content: 'oi' }], tools: [], context: {} } as any)
    expect((result as any).costUsd).toBeNull()
  })
})
