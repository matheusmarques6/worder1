// =============================================
// WORDER: AI usage cost tracker
// /src/lib/ai/cost-tracker.ts
//
// Uso:
//   await trackAiUsage({
//     organizationId, provider: 'openai', model: 'gpt-4o-mini',
//     feature: 'whatsapp_agent', promptTokens, completionTokens,
//     agentId, conversationId, durationMs,
//   })
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'

// =============================================
// Preços em USD por 1M tokens (snapshot 2026-04).
//
// Auditoria 2026-08-28, item 42: a tabela NÃO morre (ruling C) — OpenAI e
// Anthropic não devolvem custo na resposta da API, então estimar por tabela
// é a única forma de ter um número pra esses dois. O que mudou: as chaves
// agora levam o namespace `<provider>/<model>` batendo com o id REAL que
// chega em `estimateCostUsd` — direto (provider bare, ex. 'gpt-4o-mini')
// OU via OpenRouter (já namespaced, ex. 'google/gemini-flash-1.5'). Modelo
// que não bate com nenhuma chave (o caso do piloto, `google/gemini-3.5-flash`
// — não existe entrada 3.5 nem aqui nem no catálogo) vira **desconhecido**
// (`null`), nunca `0` — ver `estimateCostUsd` abaixo.
// =============================================

// Google: o OpenRouter inverte o sufixo de versão (`gemini-flash-1.5`, não
// `gemini-1.5-flash` — ver src/app/api/ai/models/route.ts:598,612) e o
// provider do agente pode vir como 'google' OU 'gemini' (AIProvider aceita
// os dois). As duas grafias e os dois namespaces apontam pro mesmo preço.
const GEMINI_20_FLASH = { in: 0.10, out: 0.40 }
const GEMINI_15_PRO = { in: 1.25, out: 5.00 }
const GEMINI_15_FLASH = { in: 0.075, out: 0.30 }

const PRICING: Record<string, { in: number; out: number }> = {
  // OpenAI
  'openai/gpt-4o':        { in: 2.50,  out: 10.00 },
  'openai/gpt-4o-mini':   { in: 0.15,  out: 0.60 },
  'openai/gpt-4-turbo':   { in: 10.00, out: 30.00 },
  'openai/gpt-3.5-turbo': { in: 0.50,  out: 1.50 },
  'openai/o1-preview':    { in: 15.00, out: 60.00 },
  'openai/o1-mini':       { in: 3.00,  out: 12.00 },

  // Anthropic
  'anthropic/claude-opus-4-6':   { in: 15.00, out: 75.00 },
  'anthropic/claude-sonnet-4-6': { in: 3.00,  out: 15.00 },
  'anthropic/claude-haiku-4-5':  { in: 0.80,  out: 4.00 },
  'anthropic/claude-3-5-sonnet': { in: 3.00,  out: 15.00 },
  'anthropic/claude-3-5-haiku':  { in: 1.00,  out: 5.00 },
  'anthropic/claude-3-opus':     { in: 15.00, out: 75.00 },

  // Google
  'google/gemini-2.0-flash': GEMINI_20_FLASH,
  'gemini/gemini-2.0-flash': GEMINI_20_FLASH,
  'google/gemini-1.5-pro':   GEMINI_15_PRO,
  'gemini/gemini-1.5-pro':   GEMINI_15_PRO,
  'google/gemini-pro-1.5':   GEMINI_15_PRO,
  'gemini/gemini-pro-1.5':   GEMINI_15_PRO,
  'google/gemini-1.5-flash': GEMINI_15_FLASH,
  'gemini/gemini-1.5-flash': GEMINI_15_FLASH,
  'google/gemini-flash-1.5': GEMINI_15_FLASH,
  'gemini/gemini-flash-1.5': GEMINI_15_FLASH,
}

export interface TrackAiUsageInput {
  organizationId: string
  provider: 'openai' | 'anthropic' | 'google' | string
  model: string
  feature: string
  agentId?: string | null
  conversationId?: string | null
  promptTokens?: number
  completionTokens?: number
  durationMs?: number
  success?: boolean
  error?: string
  metadata?: Record<string, any>
  /** custo explícito em USD (override). `null` explícito = "sei que é desconhecido". */
  costUsdOverride?: number | null
}

/**
 * Estima o custo em USD a partir da tabela de preços.
 *
 * Item 42: ausência na tabela devolve `null` ("desconhecido"), nunca `0`
 * ("gratuito") — um zero inventado é o número que faz qualquer teto de
 * gasto passar em silêncio. `null` se propaga até `ai_usage_logs.cost_usd`
 * (agora nullable, ver migration `20260902000003_ai_usage_logs_cost_usd_unknown.sql`)
 * sem nunca ser coagido a `0` no caminho.
 *
 * Lookup tenta, nessa ordem: o `model` como chegou (cobre OpenRouter, que já
 * manda `<provider>/<model>`), depois `<provider>/<model>` composto (cobre
 * provider direto, que manda o model bare), depois as duas variantes em
 * lowercase.
 */
export function estimateCostUsd(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number | null {
  const namespaced = model.includes('/') ? model : `${provider}/${model}`
  const p =
    PRICING[model] ||
    PRICING[namespaced] ||
    PRICING[model.toLowerCase()] ||
    PRICING[namespaced.toLowerCase()]
  if (!p) return null
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out
}

export async function trackAiUsage(input: TrackAiUsageInput): Promise<void> {
  try {
    const promptTokens = input.promptTokens || 0
    const completionTokens = input.completionTokens || 0
    const costUsd =
      input.costUsdOverride !== undefined
        ? input.costUsdOverride
        : estimateCostUsd(input.provider, input.model, promptTokens, completionTokens)

    if (costUsd === null) {
      // Ruling D: modelo fora da tabela é visível, não silencioso — mesmo
      // padrão de console.warn usado no catch abaixo e em budget.ts.
      console.warn(
        '[trackAiUsage] custo desconhecido — modelo fora da tabela de precos:',
        { provider: input.provider, model: input.model }
      )
    }

    await supabaseAdmin.from('ai_usage_logs').insert({
      organization_id: input.organizationId,
      provider: input.provider,
      model: input.model,
      feature: input.feature,
      agent_id: input.agentId || null,
      conversation_id: input.conversationId || null,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costUsd === null ? null : Math.round(costUsd * 1_000_000) / 1_000_000,
      duration_ms: input.durationMs || null,
      success: input.success !== false,
      error: input.error || null,
      metadata: input.metadata || {},
    })
  } catch (err: any) {
    // Não bloquear fluxo de IA se logging falhar
    console.warn('[trackAiUsage]', err?.message)
  }
}
