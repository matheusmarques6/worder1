// =============================================
// Trigger do pipeline de IA — chamado pelos webhooks Evolution e Meta
// Cloud API após persistirem uma mensagem inbound. Verifica se a conversa
// tem agente IA atribuído e está habilitada, então enfileira no buffer
// (debounce) e agenda o worker /api/workers/ai-respond.
//
// Falha silenciosa em qualquer passo — webhook nunca deve quebrar por
// causa do trigger de IA.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { appendToBuffer } from '@/lib/inbox/buffer'
import { scheduleWorker } from '@/lib/redis/qstash'

export interface AITriggerInput {
  conversationId: string
  messageId: string
  organizationId: string
}

interface ConversationGate {
  ai_agent_id: string | null
  ai_paused: boolean | null
  ai_enabled: boolean | null
  ai_paused_until: string | null
}

function getAppBaseUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_URL
  if (!url) return null
  return url.startsWith('http') ? url : `https://${url}`
}

/**
 * Verifica se a IA deve responder essa conversa, e se sim, dispara o
 * buffer + scheduleWorker. Retorna metadata pra logs do caller.
 */
export async function triggerAIPipeline(
  input: AITriggerInput,
): Promise<{ triggered: boolean; reason?: string; agentId?: string; messageScheduleId?: string | null }> {
  try {
    const supabase = getSupabaseAdmin()

    // 1) Lê o gate da conversa (single round-trip)
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('ai_agent_id, ai_paused, ai_enabled, ai_paused_until')
      .eq('id', input.conversationId)
      .maybeSingle()
    if (error) return { triggered: false, reason: 'gate_read_error' }
    if (!data) return { triggered: false, reason: 'conversation_not_found' }
    const gate = data as ConversationGate

    if (!gate.ai_agent_id) {
      return { triggered: false, reason: 'no_agent_assigned' }
    }
    if (gate.ai_paused) {
      // Respeita pausa; se ai_paused_until passou, o usuário ainda precisa
      // despausar manualmente — sem auto-resume nessa fase.
      return { triggered: false, reason: 'ai_paused' }
    }
    if (gate.ai_enabled === false) {
      return { triggered: false, reason: 'ai_disabled_legacy_flag' }
    }

    // 2) Append no buffer Redis (debounce). Se Redis ausente, retorna
    // shouldSchedule=true para fallback síncrono.
    const { shouldSchedule } = await appendToBuffer(
      input.conversationId,
      input.messageId,
    )
    if (!shouldSchedule) {
      return { triggered: false, reason: 'within_existing_window', agentId: gate.ai_agent_id }
    }

    // 3) Agenda worker via QStash com delay = AI_BUFFER_DEBOUNCE_MS
    const baseUrl = getAppBaseUrl()
    if (!baseUrl) {
      return {
        triggered: false,
        reason: 'no_base_url',
        agentId: gate.ai_agent_id,
      }
    }
    const debounceMs = parseInt(process.env.AI_BUFFER_DEBOUNCE_MS || '5000', 10)
    const scheduleResult = await scheduleWorker({
      url: `${baseUrl}/api/workers/ai-respond`,
      body: { conversationId: input.conversationId, agentId: gate.ai_agent_id },
      delaySeconds: Math.max(1, Math.floor(debounceMs / 1000)),
      deduplicationId: `ai-respond:${input.conversationId}:${Math.floor(Date.now() / debounceMs)}`,
    })

    return {
      triggered: true,
      agentId: gate.ai_agent_id,
      messageScheduleId: scheduleResult?.messageId ?? null,
    }
  } catch (err) {
    console.warn('[ai/triggerAIPipeline] silent failure', err)
    return { triggered: false, reason: 'exception' }
  }
}
