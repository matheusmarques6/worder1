// =============================================
// budget.test.ts — fns puras de checkAiBudget (Task 15)
//
// Sem chamadas reais ao DB: testa a logica pura de avaliacao
// de orcamento (dentro/excedido/sem budget configurado).
// =============================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAiBudget, clearBudgetCache, AiBudgetExceededError, type BudgetCheckResult } from '../budget'

// Mock supabaseAdmin
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

import { supabaseAdmin } from '@/lib/supabase-admin'

const ORG = 'org-test-123'

function makeChain(overrides: Record<string, any> = {}) {
  const defaults = {
    data: null,
    error: null,
  }
  const result = { ...defaults, ...overrides }
  // Proxy que retorna `result` para qualquer terminador (maybeSingle, single,
  // ou implicitamente quando a cadeia é await-ada como Promise via then).
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  }
  return chain
}

describe('checkAiBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearBudgetCache()
  })

  it('retorna { allowed: true } quando nao ha budget configurado', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    // Budget query: nao encontra linha
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }))
    // Usage query: nao importa quando budget = null
    fromMock.mockReturnValueOnce(makeChain({ data: [{ cost_usd: 0.5 }], error: null }))

    const result: BudgetCheckResult = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.budgetUsd).toBeNull()
  })

  it('retorna { allowed: true } quando gasto < limite', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10.0 }, error: null }))
      .mockReturnValueOnce(makeChain({ data: [{ cost_usd: 3.0 }], error: null }))

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.spentUsd).toBeCloseTo(3.0)
    expect(result.budgetUsd).toBe(10.0)
  })

  it('retorna { allowed: false } quando gasto >= limite', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 5.0 }, error: null }))
      .mockReturnValueOnce(makeChain({ data: [{ cost_usd: 5.5 }], error: null }))

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(false)
    expect(result.spentUsd).toBeCloseTo(5.5)
    expect(result.budgetUsd).toBe(5.0)
  })

  it('retorna { allowed: true } quando a query de uso retorna null (sem historico)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10.0 }, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.spentUsd).toBe(0)
  })

  it('lanca AiBudgetExceededError quando budget excedido e throwOnExceeded=true', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 5.0 }, error: null }))
      .mockReturnValueOnce(makeChain({ data: [{ cost_usd: 6.0 }], error: null }))

    await expect(checkAiBudget(ORG, { throwOnExceeded: true }))
      .rejects
      .toBeInstanceOf(AiBudgetExceededError)
  })

  it('AiBudgetExceededError tem status 402', () => {
    const err = new AiBudgetExceededError(5.0, 6.0)
    expect(err.status).toBe(402)
    expect(err.message).toContain('budget')
  })

  it('retorna { allowed: true } quando erro de DB (fail-open gracioso)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock.mockReturnValueOnce(makeChain({ data: null, error: new Error('db error') }))

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
  })
})
