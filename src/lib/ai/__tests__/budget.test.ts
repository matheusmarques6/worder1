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

// Item 42: ai_monthly_cost_usd deixou de devolver um NUMERIC solto e passou
// a devolver TABLE(spent_usd, has_unknown_cost) — PostgREST manda isso como
// array de linhas. Helper monta o shape novo pros mocks de `rpc()` abaixo;
// `unknown` default false preserva o comportamento dos testes que não
// mexem com custo desconhecido.
function rpcRow(spentUsd: number, hasUnknownCost = false) {
  return { data: [{ spent_usd: spentUsd, has_unknown_cost: hasUnknownCost }], error: null }
}

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
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(0))
  })

  it('retorna { allowed: true } quando nao ha budget configurado (usa default $50)', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    // Budget query: nao encontra linha → usa default
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }))
    // RPC retorna gasto zero
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(0))

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
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(30.5))

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.budgetUsd).toBe(50)
    expect(result.spentUsd).toBeCloseTo(30.5)
    expect(result.hasUnknownCost).toBe(false)
  })

  it('org sem linha em ai_budgets com gasto acima de $50 é bloqueada', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(55.0))

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
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(3.0))

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
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(5.5))

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
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(0))

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(true)
    expect(result.spentUsd).toBe(0)
    // Item 42: 0 aqui é "sem histórico" (RPC devolveu has_unknown_cost:
    // false) — não confundir com o caso da próxima suite, onde 0 é "todo
    // uso do mês foi de modelo sem preço".
    expect(result.hasUnknownCost).toBe(false)
  })

  it('item 42: spentUsd fica PARCIAL (soma só o conhecido) e hasUnknownCost avisa quando ha uso de modelo sem preco', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10.0 }, error: null }))
    // Mês com $2 de custo conhecido + N chamadas de modelo fora da tabela de
    // preços (cost_usd NULL) — a RPC soma só o conhecido (SUM ignora NULL
    // em SQL) e sinaliza que a soma é parcial via has_unknown_cost.
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(2.0, true))

    const result = await checkAiBudget(ORG)

    expect(result.allowed).toBe(false)
    expect(result.spentUsd).toBeCloseTo(2.0)
    expect(result.hasUnknownCost).toBe(true)
    expect(result.unknownReason).toBe('unpriced_model')
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

  it('fallback exclui plataforma, preserva historico e ignora null nao billable', async () => {
    const budgetChain = makeChain({ data: { monthly_limit_usd: 50 }, error: null })
    const usageChain = makeChain({
      data: [
        { cost_usd: 10, metadata: { billable: true } },
        { cost_usd: 90, metadata: { billable: false } },
        { cost_usd: null, metadata: { billable: false } },
        { cost_usd: 5, metadata: null },
      ],
      error: null,
    })
    ;(supabaseAdmin as any).from = vi.fn()
      .mockReturnValueOnce(budgetChain)
      .mockReturnValueOnce(usageChain)
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function ai_monthly_cost_usd does not exist' },
    })

    const result = await checkAiBudget(ORG)

    expect(usageChain.select).toHaveBeenCalledWith('cost_usd,metadata')
    expect(result).toMatchObject({ allowed: true, spentUsd: 15, hasUnknownCost: false })
  })

  it('fallback bloqueia apenas quando a linha null e billable', async () => {
    ;(supabaseAdmin as any).from = vi.fn()
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 50 }, error: null }))
      .mockReturnValueOnce(makeChain({
        data: [
          { cost_usd: 10, metadata: { billable: true } },
          { cost_usd: null, metadata: { billable: true } },
        ],
        error: null,
      }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function ai_monthly_cost_usd does not exist' },
    })

    const result = await checkAiBudget(ORG)

    expect(result).toMatchObject({
      allowed: false,
      spentUsd: 10,
      hasUnknownCost: true,
      unknownReason: 'unpriced_model',
    })
  })

  it('lanca AiBudgetExceededError quando budget excedido e throwOnExceeded=true', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 5.0 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(6.0))

    await expect(checkAiBudget(ORG, { throwOnExceeded: true }))
      .rejects
      .toBeInstanceOf(AiBudgetExceededError)
  })

  it('limite exato continua excedido e lanca 402', async () => {
    ;(supabaseAdmin as any).from = vi.fn()
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 5 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(5))

    await expect(checkAiBudget(ORG, { throwOnExceeded: true }))
      .rejects
      .toMatchObject({ name: 'AiBudgetExceededError', status: 402 })
  })

  it('throwOnExceeded lanca 503 com lookup_error quando a consulta falha', async () => {
    ;(supabaseAdmin as any).from = vi.fn()
      .mockReturnValueOnce(makeChain({ data: null, error: new Error('db error') }))

    await expect(checkAiBudget(ORG, { throwOnExceeded: true }))
      .rejects
      .toMatchObject({
        name: 'AiBudgetUnavailableError',
        status: 503,
        unknownReason: 'lookup_error',
      })
  })

  it('throwOnExceeded lanca 503 com unpriced_model para custo cobrável desconhecido', async () => {
    ;(supabaseAdmin as any).from = vi.fn()
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(2, true))

    await expect(checkAiBudget(ORG, { throwOnExceeded: true }))
      .rejects
      .toMatchObject({
        name: 'AiBudgetUnavailableError',
        status: 503,
        unknownReason: 'unpriced_model',
      })
  })

  it('throwOnExceeded preserva o motivo desconhecido recuperado do cache', async () => {
    ;(supabaseAdmin as any).from = vi.fn()
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue(rpcRow(2, true))

    await checkAiBudget(ORG)

    await expect(checkAiBudget(ORG, { throwOnExceeded: true }))
      .rejects
      .toMatchObject({ status: 503, unknownReason: 'unpriced_model' })
    expect((supabaseAdmin as any).rpc).toHaveBeenCalledTimes(1)
  })

  it('AiBudgetExceededError tem status 402', () => {
    const err = new AiBudgetExceededError(5.0, 6.0)
    expect(err.status).toBe(402)
    expect(err.message).toContain('budget')
  })

  it('bloqueia com lookup_error quando ai_budgets fica indisponivel', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock.mockReturnValueOnce(makeChain({ data: null, error: new Error('db error') }))

    const result = await checkAiBudget(ORG)

    expect(result).toMatchObject({
      allowed: false,
      budgetUsd: null,
      spentUsd: 0,
      hasUnknownCost: false,
      unknownReason: 'lookup_error',
    })
  })

  it('bloqueia com lookup_error quando RPC falha com erro inesperado', async () => {
    const fromMock = vi.fn()
    ;(supabaseAdmin as any).from = fromMock

    fromMock
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10.0 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    })

    const result = await checkAiBudget(ORG)

    expect(result).toMatchObject({
      allowed: false,
      budgetUsd: 10,
      spentUsd: 0,
      hasUnknownCost: false,
      unknownReason: 'lookup_error',
    })
  })

  it('bloqueia com lookup_error quando o fallback falha', async () => {
    ;(supabaseAdmin as any).from = vi.fn()
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10 }, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: new Error('fallback failed') }))
    ;(supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function ai_monthly_cost_usd does not exist' },
    })

    const result = await checkAiBudget(ORG)

    expect(result).toMatchObject({
      allowed: false,
      budgetUsd: 10,
      spentUsd: 0,
      hasUnknownCost: false,
      unknownReason: 'lookup_error',
    })
  })

  it('catch-all bloqueia com lookup_error em vez de liberar', async () => {
    ;(supabaseAdmin as any).from = vi.fn(() => {
      throw new Error('unexpected')
    })

    const result = await checkAiBudget(ORG)

    expect(result).toMatchObject({
      allowed: false,
      budgetUsd: null,
      spentUsd: 0,
      hasUnknownCost: false,
      unknownReason: 'lookup_error',
    })
  })

  it('cacheia bloqueio desconhecido por org e skipCache força nova consulta', async () => {
    const fromMock = vi.fn()
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10 }, error: null }))
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10 }, error: null }))
    ;(supabaseAdmin as any).from = fromMock
    ;(supabaseAdmin as any).rpc = vi.fn()
      .mockResolvedValueOnce(rpcRow(2, true))
      .mockResolvedValueOnce(rpcRow(3, false))

    const cold = await checkAiBudget(ORG)
    const warm = await checkAiBudget(ORG)
    const refreshed = await checkAiBudget(ORG, { skipCache: true })

    expect(cold).toMatchObject({ allowed: false, unknownReason: 'unpriced_model' })
    expect(warm).toEqual(cold)
    expect(refreshed).toMatchObject({ allowed: true, spentUsd: 3 })
    expect((supabaseAdmin as any).rpc).toHaveBeenCalledTimes(2)
  })

  it('nao mistura cache entre organizacoes', async () => {
    ;(supabaseAdmin as any).from = vi.fn()
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10 }, error: null }))
      .mockReturnValueOnce(makeChain({ data: { monthly_limit_usd: 10 }, error: null }))
    ;(supabaseAdmin as any).rpc = vi.fn()
      .mockResolvedValueOnce(rpcRow(2))
      .mockResolvedValueOnce(rpcRow(12))

    const orgA = await checkAiBudget('org-a')
    const orgB = await checkAiBudget('org-b')

    expect(orgA.allowed).toBe(true)
    expect(orgB.allowed).toBe(false)
  })
})
