// =============================================
// Memória de conversa (F1) — janela deslizante de mensagens persistida em
// `ai_conversation_memory`. F2 estende com sumarização rolling.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { ConversationMemory } from '../types'

const WINDOW_SIZE = 20

export async function loadMemory(
  conversationId: string,
  agentId: string,
): Promise<ConversationMemory> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('ai_conversation_memory')
    .select('window_messages, summary, facts')
    .eq('conversation_id', conversationId)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (!data) {
    return { window_messages: [], summary: '', facts: {} }
  }
  return {
    window_messages: (data.window_messages as ConversationMemory['window_messages']) ?? [],
    summary: data.summary ?? '',
    facts: (data.facts as Record<string, unknown>) ?? {},
  }
}

export async function saveMemory(
  conversationId: string,
  agentId: string,
  organizationId: string,
  memory: ConversationMemory,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase.from('ai_conversation_memory').upsert(
    {
      conversation_id: conversationId,
      agent_id: agentId,
      organization_id: organizationId,
      window_messages: memory.window_messages.slice(-WINDOW_SIZE),
      summary: memory.summary,
      facts: memory.facts,
    },
    { onConflict: 'conversation_id,agent_id' },
  )
}
