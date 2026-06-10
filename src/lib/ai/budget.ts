// =============================================
// WORDER: AI budget gate (Task 15 — P1)
// /src/lib/ai/budget.ts
//
// checkAiBudget: verifica se a org ainda tem cota mensal disponivel.
// - Lê ai_budgets.monthly_limit_usd (DEFAULT 50 USD quando sem linha).
// - Soma cost_usd via RPC ai_monthly_cost_usd (sem truncar em 1000 linhas).
//   Fallback gracioso para .select() COM .limit(100000) se o RPC não existir
//   (erro 42883 / function does not exist) — degrade documentado.
// - Cache em memória curto (30s) para não bater o DB a cada mensagem.
// - Fail-open: erro de DB → permite (não trava fluxo).
// - Opção throwOnExceeded: lança AiBudgetExceededError (status 402).
//
// Env:
//   DEFAULT_MONTHLY_LIMIT_USD — limite padrão para orgs sem linha em ai_budgets.
//   Padrão: 50 USD/mês. Orgs que legitimamente gastam mais precisam de linha
//   própria em ai_budgets (deploy checklist).
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'

// Cache em memória: chave = orgId, valor = { result, expiresAt }
const CACHE_TTL_MS = 30_000 // 30 segundos

interface CacheEntry {
  result: BudgetCheckResult
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export interface BudgetCheckResult {
  allowed: boolean
  /** Limite configurado (null = sem limite) */
  budgetUsd: number | null
  /** Gasto acumulado no mês corrente */
  spentUsd: number
}

export interface CheckAiBudgetOptions {
  /** Se true, lança AiBudgetExceededError quando excedido (padrão: false) */
  throwOnExceeded?: boolean
  /** Ignora cache (útil em testes). Padrão: false */
  skipCache?: boolean
}

// =============================================
// Erro tipado — status 402 para rotas HTTP
// =============================================

export class AiBudgetExceededError extends Error {
  readonly status = 402
  readonly budgetUsd: number
  readonly spentUsd: number

  constructor(budgetUsd: number, spentUsd: number) {
    super(
      `AI budget excedido: gasto $${spentUsd.toFixed(4)} USD de limite $${budgetUsd.toFixed(4)} USD/mês`
    )
    this.name = 'AiBudgetExceededError'
    this.budgetUsd = budgetUsd
    this.spentUsd = spentUsd
  }
}

// =============================================
// Limite padrão quando a org não tem linha em ai_budgets.
// Orgs que legitimamente gastam mais de $50/mês precisam de linha
// própria em ai_budgets (veja deploy checklist).
// =============================================
function _defaultBudgetUsd(): number {
  const env = process.env.DEFAULT_MONTHLY_LIMIT_USD
  if (env) {
    const parsed = parseFloat(env)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  return 50
}

// =============================================
// Soma do custo do mês via RPC (sem truncar em 1000 linhas).
// Fallback gracioso: se a função não existir (código 42883),
// usa .select() com .limit(100000) e soma no cliente.
// Degrade documentado: ambientes sem a migration 20260616 usam fallback.
// =============================================
async function _sumMonthCostUsd(organizationId: string, monthStart: string): Promise<number> {
  // Tentativa 1: RPC ai_monthly_cost_usd (soma server-side, sem truncar)
  const { data: rpcData, error: rpcErr } = await (supabaseAdmin as any).rpc(
    'ai_monthly_cost_usd',
    { p_organization_id: organizationId, p_month_start: monthStart }
  )

  if (!rpcErr) {
    return Number(rpcData) || 0
  }

  // Degrade: RPC não existe (42883 = undefined_function) → fallback com limite
  if (rpcErr.code === '42883' || (rpcErr.message && rpcErr.message.includes('function') && rpcErr.message.includes('does not exist'))) {
    console.warn('[checkAiBudget] RPC ai_monthly_cost_usd não encontrado — usando fallback .select() com limit(100000)')
    const { data: usageRows, error: usageErr } = await (supabaseAdmin as any)
      .from('ai_usage_logs')
      .select('cost_usd')
      .eq('organization_id', organizationId)
      .gte('created_at', monthStart)
      .limit(100000)

    if (usageErr) {
      throw usageErr
    }

    const rows: Array<{ cost_usd: number }> = Array.isArray(usageRows) ? usageRows : []
    return rows.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0)
  }

  // Outro erro inesperado: propaga para fail-open no caller
  throw rpcErr
}

// =============================================
// Função principal
// =============================================

export async function checkAiBudget(
  organizationId: string,
  options: CheckAiBudgetOptions = {}
): Promise<BudgetCheckResult> {
  const { throwOnExceeded = false, skipCache = false } = options

  // Cache hit
  if (!skipCache) {
    const cached = cache.get(organizationId)
    if (cached && cached.expiresAt > Date.now()) {
      const result = cached.result
      if (!result.allowed && throwOnExceeded && result.budgetUsd !== null) {
        throw new AiBudgetExceededError(result.budgetUsd, result.spentUsd)
      }
      return result
    }
  }

  try {
    // 1. Buscar limite configurado
    const { data: budgetRow, error: budgetErr } = await (supabaseAdmin as any)
      .from('ai_budgets')
      .select('monthly_limit_usd')
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (budgetErr) {
      // Fail-open: erro de DB não bloqueia
      console.warn('[checkAiBudget] erro ao ler ai_budgets:', budgetErr?.message)
      return { allowed: true, budgetUsd: null, spentUsd: 0 }
    }

    // Sem linha → usa DEFAULT_MONTHLY_LIMIT_USD (padrão $50/mês)
    const budgetUsd: number =
      budgetRow?.monthly_limit_usd != null
        ? Number(budgetRow.monthly_limit_usd)
        : _defaultBudgetUsd()

    // 2. Somar gasto do mês corrente via RPC (com fallback gracioso)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    let spentUsd: number
    try {
      spentUsd = await _sumMonthCostUsd(organizationId, monthStart)
    } catch (usageErr: any) {
      console.warn('[checkAiBudget] erro ao somar ai_usage_logs:', usageErr?.message)
      // Fail-open
      const result: BudgetCheckResult = { allowed: true, budgetUsd, spentUsd: 0 }
      _setCached(organizationId, result)
      return result
    }

    const allowed = spentUsd < budgetUsd
    const result: BudgetCheckResult = { allowed, budgetUsd, spentUsd }
    _setCached(organizationId, result)

    if (!allowed && throwOnExceeded) {
      throw new AiBudgetExceededError(budgetUsd, spentUsd)
    }

    return result
  } catch (err) {
    if (err instanceof AiBudgetExceededError) throw err
    // Qualquer outro erro → fail-open
    console.warn('[checkAiBudget] erro inesperado:', (err as any)?.message)
    return { allowed: true, budgetUsd: null, spentUsd: 0 }
  }
}

function _setCached(organizationId: string, result: BudgetCheckResult) {
  cache.set(organizationId, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Limpa cache (útil em testes) */
export function clearBudgetCache() {
  cache.clear()
}
