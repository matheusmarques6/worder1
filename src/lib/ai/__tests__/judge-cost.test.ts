import { describe, expect, it, vi } from 'vitest'

const { callAI } = vi.hoisted(() => ({ callAI: vi.fn() }))
vi.mock('@/lib/whatsapp/ai-providers', () => ({ callAI }))
import { judgeCase } from '../judge'

describe('judgeCase usage', () => {
  it('preserva uso factual para o tracker de avaliação', async () => {
    callAI.mockResolvedValue({ content: '{"score":100,"criteria":[{"id":"c1","pass":true}]}', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, costUsd: 0 } })
    const verdict = await judgeCase({ provider: 'openrouter', apiKey: 'key', input: 'in', output: 'out', criteria: [{ id: 'c1', label: 'ok' }] })
    expect((verdict as any).usage).toMatchObject({ promptTokens: 10, completionTokens: 5, costUsd: 0 })
  })
})
