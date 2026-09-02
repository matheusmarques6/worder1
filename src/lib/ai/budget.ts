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
  /**
   * Gasto conhecido acumulado no mês corrente — soma apenas linhas com
   * `cost_usd` não-nulo (item 42). NUNCA inclui um `0` inventado para
   * chamada de modelo sem preço na tabela; essas ficam de fora da soma E
   * são sinalizadas por `hasUnknownCost`.
   */
  spentUsd: number
  /**
   * true quando o mês tem pelo menos uma chamada com `cost_usd` NULL
   * (modelo fora da tabela de preços) — quando true, `spentUsd` é PARCIAL:
   * o gasto real da org pode ser maior do que este número mostra. Item 42,
   * ruling D: existir e não ser lido é o mesmo bug de novo — ver o
   * `console.warn` em `checkAiBudget` e o item novo registrado no
   * checklist sobre o que fazer com esse caso no bloqueio.
   */
  hasUnknownCost: boolean
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

interface MonthCostSum {
  spentUsd: number
  hasUnknownCost: boolean
}

// =============================================
// Soma do custo do mês via RPC (sem truncar em 1000 linhas).
// Fallback gracioso: se a função não existir (código 42883),
// usa .select() com .limit(100000) e soma no cliente.
// Degrade documentado: ambientes sem a migration 20260616 usam fallback.
//
// Item 42: `cost_usd` pode ser NULL (modelo fora da tabela de preços,
// ver cost-tracker.ts::estimateCostUsd). SUM em SQL já ignora NULL — soma
// só o conhecido, corretamente — mas a RPC devolvia só esse número, sem
// dizer se ele é completo ou parcial (um mês inteiro de chamadas
// desconhecidas somava exatamente igual a um mês sem nenhum gasto: os dois
// dão 0). `ai_monthly_cost_usd` agora devolve `has_unknown_cost` junto —
// ver migration `20260902000003_ai_usage_logs_cost_usd_unknown.sql`.
// =============================================
async function _sumMonthCostUsd(organizationId: string, monthStart: string): Promise<MonthCostSum> {
  // Tentativa 1: RPC ai_monthly_cost_usd (soma server-side, sem truncar)
  const { data: rpcData, error: rpcErr } = await (supabaseAdmin as any).rpc(
    'ai_monthly_cost_usd',
    { p_organization_id: organizationId, p_month_start: monthStart }
  )

  if (!rpcErr) {
    // RETURNS TABLE(...) via PostgREST volta como array de linhas.
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    return {
      spentUsd: Number(row?.spent_usd) || 0,
      hasUnknownCost: !!row?.has_unknown_cost,
    }
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

    const rows: Array<{ cost_usd: number | null }> = Array.isArray(usageRows) ? usageRows : []
    let spentUsd = 0
    let hasUnknownCost = false
    for (const r of rows) {
      if (r.cost_usd === null || r.cost_usd === undefined) {
        hasUnknownCost = true
      } else {
        spentUsd += Number(r.cost_usd) || 0
      }
    }
    return { spentUsd, hasUnknownCost }
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
      // Fail-open: erro de DB não bloqueia. hasUnknownCost:false aqui é só
      // preenchimento estrutural do tipo — este ramo é erro de conexão/
      // consulta em ai_budgets, não tem relação com preço de modelo
      // desconhecido (item 42); não confundir os dois motivos de "não sei
      // o gasto". Ruling E: este fail-open não é escopo do item 42.
      console.warn('[checkAiBudget] erro ao ler ai_budgets:', budgetErr?.message)
      return { allowed: true, budgetUsd: null, spentUsd: 0, hasUnknownCost: false }
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
    let hasUnknownCost: boolean
    try {
      ;({ spentUsd, hasUnknownCost } = await _sumMonthCostUsd(organizationId, monthStart))
    } catch (usageErr: any) {
      console.warn('[checkAiBudget] erro ao somar ai_usage_logs:', usageErr?.message)
      // Fail-open (mesma ressalva do bloco acima: erro de DB, não modelo
      // desconhecido — hasUnknownCost:false é estrutural, não um dado real)
      const result: BudgetCheckResult = { allowed: true, budgetUsd, spentUsd: 0, hasUnknownCost: false }
      _setCached(organizationId, result)
      return result
    }

    if (hasUnknownCost) {
      // Ruling D do item 42: visível, não silencioso. spentUsd abaixo é
      // PARCIAL — a org teve uso de modelo sem preço na tabela este mês, e
      // esse uso não entra na soma nem no teto. Se/quando isso deve travar
      // o agente (fail-closed) em vez de só avisar é decisão de produto —
      // ver item novo no checklist (mesma família do ruling E).
      console.warn(
        `[checkAiBudget] org ${organizationId} tem chamada(s) de modelo sem preco conhecido este mes — spentUsd=${spentUsd} e PARCIAL`
      )
    }

    const allowed = spentUsd < budgetUsd
    const result: BudgetCheckResult = { allowed, budgetUsd, spentUsd, hasUnknownCost }
    _setCached(organizationId, result)

    if (!allowed && throwOnExceeded) {
      throw new AiBudgetExceededError(budgetUsd, spentUsd)
    }

    return result
  } catch (err) {
    if (err instanceof AiBudgetExceededError) throw err
    // Qualquer outro erro → fail-open (hasUnknownCost:false é estrutural,
    // ver nota nos outros dois ramos fail-open acima)
    console.warn('[checkAiBudget] erro inesperado:', (err as any)?.message)
    return { allowed: true, budgetUsd: null, spentUsd: 0, hasUnknownCost: false }
  }
}

function _setCached(organizationId: string, result: BudgetCheckResult) {
  cache.set(organizationId, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Limpa cache (útil em testes) */
export function clearBudgetCache() {
  cache.clear()
}
