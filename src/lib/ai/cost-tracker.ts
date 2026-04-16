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

// Preços em USD por 1M tokens (snapshot 2026-04)
const PRICING: Record<string, { in: number; out: number }> = {
  // OpenAI
  'gpt-4o':                { in: 2.50,  out: 10.00 },
  'gpt-4o-mini':           { in: 0.15,  out: 0.60 },
  'gpt-4-turbo':           { in: 10.00, out: 30.00 },
  'gpt-3.5-turbo':         { in: 0.50,  out: 1.50 },
  'o1-preview':            { in: 15.00, out: 60.00 },
  'o1-mini':               { in: 3.00,  out: 12.00 },

  // Anthropic
  'claude-opus-4-6':       { in: 15.00, out: 75.00 },
  'claude-sonnet-4-6':     { in: 3.00,  out: 15.00 },
  'claude-haiku-4-5':      { in: 0.80,  out: 4.00 },
  'claude-3-5-sonnet':     { in: 3.00,  out: 15.00 },
  'claude-3-5-haiku':      { in: 1.00,  out: 5.00 },
  'claude-3-opus':         { in: 15.00, out: 75.00 },

  // Google
  'gemini-2.0-flash':      { in: 0.10,  out: 0.40 },
  'gemini-1.5-pro':        { in: 1.25,  out: 5.00 },
  'gemini-1.5-flash':      { in: 0.075, out: 0.30 },
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
  /** custo explícito em USD (override) */
  costUsdOverride?: number
}

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const p = PRICING[model] || PRICING[model.toLowerCase()]
  if (!p) return 0
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out
}

export async function trackAiUsage(input: TrackAiUsageInput): Promise<void> {
  try {
    const promptTokens = input.promptTokens || 0
    const completionTokens = input.completionTokens || 0
    const costUsd =
      input.costUsdOverride ??
      estimateCostUsd(input.model, promptTokens, completionTokens)

    await supabaseAdmin.from('ai_usage_logs').insert({
      organization_id: input.organizationId,
      provider: input.provider,
      model: input.model,
      feature: input.feature,
      agent_id: input.agentId || null,
      conversation_id: input.conversationId || null,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
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
