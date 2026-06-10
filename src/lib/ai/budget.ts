// =============================================
// WORDER: AI budget gate (Task 15 — P1)
// /src/lib/ai/budget.ts
//
// checkAiBudget: verifica se a org ainda tem cota mensal disponivel.
// - Lê ai_budgets.monthly_limit_usd (NULL = sem limite → permite).
// - Soma cost_usd de ai_usage_logs no mês corrente.
// - Cache em memória curto (30s) para não bater o DB a cada mensagem.
// - Fail-open: erro de DB → permite (não trava fluxo).
// - Opção throwOnExceeded: lança AiBudgetExceededError (status 402).
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

    const budgetUsd: number | null = budgetRow?.monthly_limit_usd ?? null

    // Sem limite configurado → permite imediatamente
    if (budgetUsd === null) {
      const result: BudgetCheckResult = { allowed: true, budgetUsd: null, spentUsd: 0 }
      _setCached(organizationId, result)
      return result
    }

    // 2. Somar gasto do mês corrente
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { data: usageRows, error: usageErr } = await (supabaseAdmin as any)
      .from('ai_usage_logs')
      .select('cost_usd')
      .eq('organization_id', organizationId)
      .gte('created_at', monthStart)

    if (usageErr) {
      console.warn('[checkAiBudget] erro ao ler ai_usage_logs:', usageErr?.message)
      // Fail-open
      const result: BudgetCheckResult = { allowed: true, budgetUsd, spentUsd: 0 }
      _setCached(organizationId, result)
      return result
    }

    // usageRows é um array de linhas; somamos cost_usd no cliente
    const rows: Array<{ cost_usd: number }> = Array.isArray(usageRows) ? usageRows : []
    const spentUsd: number = rows.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0)

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
