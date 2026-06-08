// =============================================
// WhatsApp AI Chatbot Service
// Handles: AI responses, handoff, copilot
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from './logger'
import type {
  AIAgent,
  Conversation,
  Message,
  ServiceResult,
} from './types'

const LOG_PREFIX = 'AIChatbotService'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// =============================================
// PROCESS MESSAGE WITH AI
// =============================================

export async function processWithAI(
  conversation: Conversation,
  incomingMessage: string,
  organizationId: string
): Promise<ServiceResult<{ response?: string; shouldHandoff: boolean; reason?: string }>> {
  if (!conversation.ai_agent_id) {
    return { data: { shouldHandoff: true, reason: 'No AI agent configured' } }
  }

  // Get AI agent config (canonical ai_agents table)
  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', conversation.ai_agent_id)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single()

  if (!agent) {
    return { data: { shouldHandoff: true, reason: 'AI agent not found or inactive' } }
  }

  // Check max interactions
  if (agent.max_interactions) {
    const { count } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('sender_type', 'bot')

    if (count && count >= agent.max_interactions) {
      return { data: { shouldHandoff: true, reason: 'Max AI interactions reached' } }
    }
  }

  // Check handoff keywords
  if (agent.handoff_keywords && agent.handoff_keywords.length > 0) {
    const lowerMessage = incomingMessage.toLowerCase()
    const matchedKeyword = agent.handoff_keywords.find((kw: string) =>
      lowerMessage.includes(kw.toLowerCase())
    )
    if (matchedKeyword) {
      return {
        data: {
          shouldHandoff: true,
          reason: `Keyword detected: "${matchedKeyword}"`,
        },
      }
    }
  }

  // Build conversation history
  const { data: recentMessages } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('direction, content, sender_type, message_type')
    .eq('conversation_id', conversation.id)
    .eq('is_internal_note', false)
    .neq('message_type', 'system')
    .order('created_at', { ascending: false })
    .limit(20)

  const history: ChatMessage[] = []

  // System prompt with knowledge base
  let systemPrompt = agent.system_prompt
  if (agent.knowledge_base) {
    systemPrompt += `\n\n## Base de Conhecimento (FAQ)\n${agent.knowledge_base}`
  }

  // Add context about the contact
  systemPrompt += `\n\n## Contexto da Conversa\n`
  systemPrompt += `- Nome do contato: ${conversation.contact_name || 'Desconhecido'}\n`
  systemPrompt += `- Telefone: ${conversation.contact_phone}\n`
  if (conversation.tags && conversation.tags.length > 0) {
    systemPrompt += `- Tags: ${conversation.tags.join(', ')}\n`
  }

  history.push({ role: 'system', content: systemPrompt })

  // Add recent messages in chronological order
  const messages = (recentMessages || []).reverse()
  for (const msg of messages) {
    if (!msg.content) continue
    if (msg.direction === 'inbound') {
      history.push({ role: 'user', content: msg.content })
    } else if (msg.sender_type === 'bot') {
      history.push({ role: 'assistant', content: msg.content })
    }
  }

  // Add current message
  history.push({ role: 'user', content: incomingMessage })

  // Call OpenAI
  try {
    const response = await callOpenAI(
      history,
      agent.model,
      agent.temperature,
      agent.max_tokens
    )

    if (!response) {
      return { data: { shouldHandoff: true, reason: 'Empty AI response' } }
    }

    // Check if AI wants to handoff
    const handoffPhrases = [
      'transferir para um atendente',
      'falar com um humano',
      'transferir para humano',
      'encaminhar para atendente',
      'HANDOFF_TO_HUMAN',
    ]
    const shouldHandoff = handoffPhrases.some((phrase) =>
      response.toLowerCase().includes(phrase.toLowerCase())
    )

    // Update agent stats
    await supabaseAdmin
      .from('ai_agents')
      .update({
        total_messages: (agent.total_messages || 0) + 1,
      })
      .eq('id', agent.id)

    return { data: { response, shouldHandoff } }
  } catch (err: unknown) {
    const error = err as Error
    logger.error(LOG_PREFIX, 'OpenAI call failed', error.message)
    return { data: { shouldHandoff: true, reason: `AI error: ${error.message}` } }
  }
}

// =============================================
// COPILOT: Suggest response to agent
// =============================================

export async function getCopilotSuggestion(
  conversationId: string,
  organizationId: string,
  lastMessage: string
): Promise<ServiceResult<{ suggestion: string }>> {
  // Get conversation context
  const { data: conversation } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('ai_agent_id, contact_name, contact_phone, tags')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single()

  if (!conversation) {
    return { error: 'Conversation not found' }
  }

  // Get AI agent for copilot config
  let systemPrompt = 'Voce e um assistente de atendimento ao cliente. Sugira uma resposta profissional e empática para a mensagem do cliente. Responda diretamente com o texto sugerido, sem explicações.'
  let model = 'gpt-4o-mini'
  let temperature = 0.7
  let maxTokens = 300

  if (conversation.ai_agent_id) {
    const { data: agent } = await supabaseAdmin
      .from('ai_agents')
      .select('system_prompt, model, temperature, max_tokens')
      .eq('id', conversation.ai_agent_id)
      .eq('organization_id', organizationId)
      .single()

    if (agent) {
      // ai_agents.system_prompt mapeia diretamente o prompt do copiloto.
      // Conhecimento (knowledge_base legado) agora vive em ai_agent_sources/ai_agent_chunks (RAG)
      // e não é injetado aqui; o copiloto usa apenas o prompt canônico.
      if (agent.system_prompt) {
        systemPrompt = `Voce e um copiloto de atendimento. Baseado no contexto abaixo, sugira uma resposta para o agente humano enviar ao cliente.\n\n${agent.system_prompt}`
      }
      if (agent.model) model = agent.model
      if (agent.temperature != null) temperature = agent.temperature
      if (agent.max_tokens != null) maxTokens = agent.max_tokens
    }
  }

  // =============================================
  // RAG: injetar conhecimento relevante no systemPrompt (best-effort)
  // =============================================
  // Quando houver agentId resolvido e uma query (lastMessage) não vazia,
  // busca trechos relevantes na base de conhecimento do agente (RAG por agentId,
  // que já é da org) e os injeta como contexto no prompt do copiloto ANTES do LLM.
  // Defensivo: sem agentId / query vazia / falha do RAG / vazio -> segue sem contexto.
  const ragQuery = (lastMessage || '').trim()
  if (conversation.ai_agent_id && ragQuery) {
    try {
      const { createRAGService } = await import('@/lib/ai/rag')
      const rag = createRAGService()
      // MESMOS valores do handler search_knowledge (Fase 2b): topK=5, threshold=0.7
      const results = await rag.search({
        agentId: conversation.ai_agent_id,
        query: ragQuery,
        topK: 5,
        threshold: 0.7,
      })

      if (results && results.length > 0) {
        const MAX_CHUNK_CHARS = 800
        const blocks = results.slice(0, 5).map((r) => {
          const content = (r.content || '').slice(0, MAX_CHUNK_CHARS)
          const source = r.source_name || 'Desconhecido'
          return `- ${content} (fonte: ${source})`
        })

        systemPrompt = `${systemPrompt}\n\nBase de conhecimento relevante (use estas informações para fundamentar a sugestão; se não for suficiente, responda com cautela):\n${blocks.join('\n')}`
      }
    } catch (ragErr: unknown) {
      // Best-effort: não quebrar o copiloto se o RAG falhar.
      logger.warn(LOG_PREFIX, `RAG indisponível no copiloto, seguindo sem contexto: ${(ragErr as Error)?.message}`)
    }
  }

  // Get recent conversation
  const { data: recentMessages } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('direction, content, sender_type')
    .eq('conversation_id', conversationId)
    .eq('is_internal_note', false)
    .order('created_at', { ascending: false })
    .limit(10)

  const history: ChatMessage[] = [{ role: 'system', content: systemPrompt }]

  const msgs = (recentMessages || []).reverse()
  for (const msg of msgs) {
    if (!msg.content) continue
    history.push({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.content,
    })
  }

  history.push({ role: 'user', content: lastMessage })

  try {
    const suggestion = await callOpenAI(history, model, temperature, maxTokens)
    return { data: { suggestion: suggestion || '' } }
  } catch (err: unknown) {
    const error = err as Error
    return { error: error.message }
  }
}

// =============================================
// HANDLE AI RESPONSE IN CONVERSATION
// =============================================

export async function handleAIResponse(
  conversationId: string,
  organizationId: string,
  instanceId: string,
  contactPhone: string,
  incomingMessage: string
): Promise<void> {
  // Get conversation
  const { data: conversation } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single()

  if (!conversation || !conversation.bot_active) return

  const result = await processWithAI(conversation, incomingMessage, organizationId)

  if (!result.data) return

  const { response, shouldHandoff, reason } = result.data

  if (shouldHandoff) {
    // Disable bot and notify
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        bot_active: false,
        status: 'pending',
      })
      .eq('id', conversationId)

    // Insert system message about handoff
    await supabaseAdmin.from('whatsapp_messages').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: 'outbound',
      message_type: 'system',
      content: `IA transferiu para atendimento humano${reason ? `: ${reason}` : ''}`,
      sender_type: 'system',
      status: 'sent',
      is_from_me: true,
      is_internal_note: false,
    })

    logger.info(LOG_PREFIX, `Handoff triggered: ${reason}`)
    return
  }

  if (response) {
    // Send AI response via WhatsApp
    const { sendMessage } = await import('./message-service')

    await sendMessage({
      conversationId,
      organizationId,
      instanceId,
      to: contactPhone,
      messageType: 'text',
      content: response,
      senderType: 'bot',
      senderName: 'IA',
    })
  }
}

// =============================================
// OPENAI CALL
// =============================================

async function callOpenAI(
  messages: ChatMessage[],
  model: string = 'gpt-4o-mini',
  temperature: number = 0.7,
  maxTokens: number = 500
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `OpenAI API error: ${response.status} - ${error?.error?.message || 'Unknown'}`
    )
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || null
}
