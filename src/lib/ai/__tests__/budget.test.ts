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
    rpc: vi.fn(),
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
    limit: vi.fn().mockReturnThis(),
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
    // Por padrão: RPC retorna 0 (sem gastos)
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({ data: 0, error: null })
  })

  it('retorna { allowed: true } quando nao ha budget configurado (usa default $50)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    // Budget query: nao encontra linha → usa default
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }))
    // RPC retorna gasto zero
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({ data: 0, error: null })

    const result: BudgetCheckResult = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    // budgetUsd agora é o default (50) em vez de null
    expect(result.budgetUsd).toBe(50)
    expect(result.spentUsd).toBe(0)
  })

  it('org sem linha em ai_budgets com gasto abaixo de $50 é permitida', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({ data: 30.5, error: null })

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.budgetUsd).toBe(50)
    expect(result.spentUsd).toBeCloseTo(30.5)
  })

  it('org sem linha em ai_budgets com gasto acima de $50 é bloqueada', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({ data: 55.0, error: null })

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(false)
    expect(result.budgetUsd).toBe(50)
    expect(result.spentUsd).toBeCloseTo(55.0)
  })

  it('retorna { allowed: true } quando gasto < limite (via RPC)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10.0 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({ data: 3.0, error: null })

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.spentUsd).toBeCloseTo(3.0)
    expect(result.budgetUsd).toBe(10.0)
  })

  it('retorna { allowed: false } quando gasto >= limite (via RPC)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 5.0 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({ data: 5.5, error: null })

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(false)
    expect(result.spentUsd).toBeCloseTo(5.5)
    expect(result.budgetUsd).toBe(5.0)
  })

  it('retorna { allowed: true } quando o RPC retorna zero (sem historico)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10.0 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({ data: 0, error: null })

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.spentUsd).toBe(0)
  })

  it('fallback para .select() quando RPC nao existe (erro 42883)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10.0 }, error: null }))
      .mockReturnValueOnce(makeChain({ data: [{ cost_usd: 3.0 }], error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function ai_monthly_cost_usd does not exist' },
    })

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.spentUsd).toBeCloseTo(3.0)
    expect(result.budgetUsd).toBe(10.0)
  })

  it('lanca AiBudgetExceededError quando budget excedido e throwOnExceeded=true', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 5.0 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({ data: 6.0, error: null })

    await expect(checkAiBudget(ORG, { throwOnExceeded: true }))
      .rejects
      .toBeInstanceOf(AiBudgetExceededError)
  })

  it('AiBudgetExceededError tem status 402', () => {
    const err = new AiBudgetExceededError(5.0, 6.0)
    expect(err.status).toBe(402)
    expect(err.message).toContain('budget')
  })

  it('retorna { allowed: true } quando erro de DB em ai_budgets (fail-open gracioso)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock.mockReturnValueOnce(makeChain({ data: null, error: new Error('db error') }))

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
  })

  it('retorna { allowed: true } quando RPC falha com erro inesperado (fail-open gracioso)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10.0 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    })

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
  })
})
