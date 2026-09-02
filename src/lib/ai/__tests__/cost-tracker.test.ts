// =============================================
// cost-tracker.test.ts — item 42 da auditoria (custo vindo do provedor,
// não de tabela hardcoded).
//
// Não existia teste para cost-tracker.ts antes deste item (recon
// task-42-recon.md, seção 7) — o `return 0` de estimateCostUsd não estava
// fixado por ninguém. Trava aqui: modelo fora da tabela vira `null`, nunca
// `0`, tanto no retorno de estimateCostUsd quanto no cost_usd gravado por
// trackAiUsage; e o caso concreto do achado (google/gemini-3.5-flash, a org
// piloto) fica coberto por nome.
// =============================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { estimateCostUsd, trackAiUsage } from '../cost-tracker'

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

import { supabaseAdmin } from '@/lib/supabase-admin'

describe('estimateCostUsd', () => {
  it('resolve provider direto com model bare (ex: openai/gpt-4o-mini)', () => {
    const cost = estimateCostUsd('openai', 'gpt-4o-mini', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(0.15 + 0.60)
  })

  it('resolve model ja namespaced no formato OpenRouter', () => {
    const cost = estimateCostUsd('openrouter', 'anthropic/claude-3-5-sonnet', 1_000_000, 0)
    expect(cost).toBeCloseTo(3.0)
  })

  it('resolve o alias de ordem do OpenRouter pra gemini flash (gemini-flash-1.5)', () => {
    const cost = estimateCostUsd('openrouter', 'google/gemini-flash-1.5', 1_000_000, 0)
    expect(cost).toBeCloseTo(0.075)
  })

  it('devolve null (nao 0) pro modelo do achado: google/gemini-3.5-flash', () => {
    const cost = estimateCostUsd('openrouter', 'google/gemini-3.5-flash', 1_000_000, 1_000_000)
    expect(cost).toBeNull()
  })

  it('devolve null pra qualquer provider/model fora da tabela', () => {
    expect(estimateCostUsd('groq', 'llama-3.1-8b-instant', 100, 100)).toBeNull()
  })
})

describe('trackAiUsage', () => {
  let insertMock: ReturnType<typeof vi.fn>
  let warnSpy: any

  beforeEach(() => {
    insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    ;(supabaseAdmin as any).from = vi.fn().mockReturnValue({ insert: insertMock })
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('grava cost_usd numerico e nao avisa pra modelo conhecido', async () => {
    await trackAiUsage({
      organizationId: 'org-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      feature: 'whatsapp_agent',
      promptTokens: 1_000_000,
      completionTokens: 0,
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row.cost_usd).toBeCloseTo(0.15)
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('custo desconhecido'),
      expect.anything()
    )
  })

  it('grava cost_usd NULL (nao 0) e avisa pra modelo fora da tabela — o caso do piloto', async () => {
    await trackAiUsage({
      organizationId: 'org-piloto',
      provider: 'openrouter',
      model: 'google/gemini-3.5-flash',
      feature: 'whatsapp_agent',
      promptTokens: 1000,
      completionTokens: 1000,
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row.cost_usd).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('custo desconhecido'),
      expect.objectContaining({ provider: 'openrouter', model: 'google/gemini-3.5-flash' })
    )
  })

  it('costUsdOverride explicito vence a tabela', async () => {
    await trackAiUsage({
      organizationId: 'org-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      feature: 'whatsapp_agent',
      promptTokens: 1,
      completionTokens: 1,
      costUsdOverride: 9.5,
    })

    const row = insertMock.mock.calls[0][0]
    expect(row.cost_usd).toBe(9.5)
  })
})
