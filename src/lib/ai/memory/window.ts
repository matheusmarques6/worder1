// =============================================
// Memória de conversa — janela deslizante de mensagens persistida em
// `ai_conversation_memory`. Quando a janela ultrapassa WINDOW_SIZE, as
// mensagens excedentes (mais antigas) são compactadas em `summary` por
// um LLM pequeno antes de saírem da janela. Isso preserva contexto sem
// inflar tokens.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { complete } from '../llm/client'
import type { ConversationMemory, ConversationMemoryMessage } from '../types'

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
  let summary = memory.summary
  let window = memory.window_messages

  // Rolling summary: se passou da janela, compacta o overflow no summary.
  if (window.length > WINDOW_SIZE) {
    const overflow = window.slice(0, window.length - WINDOW_SIZE)
    try {
      summary = await rollingSummarize(summary, overflow)
    } catch (err) {
      console.warn('[memory] rolling summarize falhou, mantendo summary atual:', err)
    }
    window = window.slice(-WINDOW_SIZE)
  }

  await supabase.from('ai_conversation_memory').upsert(
    {
      conversation_id: conversationId,
      agent_id: agentId,
      organization_id: organizationId,
      window_messages: window,
      summary,
      facts: memory.facts,
    },
    { onConflict: 'conversation_id,agent_id' },
  )
}

async function rollingSummarize(
  prevSummary: string,
  overflow: ConversationMemoryMessage[],
): Promise<string> {
  if (overflow.length === 0) return prevSummary
  const transcript = overflow
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'IA'}: ${m.content}`)
    .join('\n')

  const prompt = [
    {
      role: 'system' as const,
      content:
        'Você é um sumarizador de conversas de WhatsApp. Atualize o resumo abaixo incorporando as novas mensagens. Foque em fatos sobre o cliente, intenções, dores, produtos discutidos, e estado da negociação. Máx 200 palavras, em português, frases curtas.',
    },
    {
      role: 'user' as const,
      content: `Resumo atual:\n${prevSummary || '(vazio)'}\n\nNovas mensagens:\n${transcript}\n\nAtualize o resumo.`,
    },
  ]

  // Usa o modelo padrão configurado (cheap/fast preferido). Trunca ao final.
  const result = await complete({
    model: process.env.AI_SUMMARIZER_MODEL || 'anthropic/claude-haiku-4-5',
    messages: prompt,
    temperature: 0.2,
    maxTokens: 400,
  })
  return result.content.trim().slice(0, 4000)
}
