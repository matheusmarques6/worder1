// =============================================
// WhatsApp AI Chat Service
// Module C: AI Chatbot, Copilot, Handoff
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from './logger'
import type { AIAgent, Message, ServiceResult } from './types'

const LOG_PREFIX = 'AIChatService'

// =============================================
// GENERATE AI RESPONSE
// =============================================

export interface AIResponseParams {
  conversationId: string
  organizationId: string
  aiAgentId: string
  contactMessage: string
  contactName?: string
  messageHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export async function generateAIResponse(
  params: AIResponseParams
): Promise<ServiceResult<{ response: string; shouldHandoff: boolean; handoffReason?: string }>> {
  const {
    conversationId,
    organizationId,
    aiAgentId,
    contactMessage,
    contactName,
    messageHistory = [],
  } = params

  // Get AI agent config (canonical ai_agents table)
  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', aiAgentId)
    .eq('organization_id', organizationId)
    .single()

  if (!agent) {
    return { error: 'AI agent not found' }
  }

  // Check handoff keywords
  const lowerMessage = contactMessage.toLowerCase()
  const matchedKeyword = (agent.handoff_keywords || []).find((kw: string) =>
    lowerMessage.includes(kw.toLowerCase())
  )

  if (matchedKeyword) {
    logger.info(LOG_PREFIX, `Handoff triggered by keyword: ${matchedKeyword}`)
    return {
      data: {
        response: '',
        shouldHandoff: true,
        handoffReason: `Keyword detectada: "${matchedKeyword}"`,
      },
    }
  }

  // Check interaction count limit
  if (agent.max_interactions) {
    const { count } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'bot')

    if ((count || 0) >= agent.max_interactions) {
      return {
        data: {
          response: '',
          shouldHandoff: true,
          handoffReason: `Limite de ${agent.max_interactions} interacoes atingido`,
        },
      }
    }
  }

  // Build system prompt with knowledge base
  const systemPrompt = buildSystemPrompt(agent, contactName)

  // Build messages for OpenAI
  const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  // Add history (last 10 messages for context)
  for (const msg of messageHistory.slice(-10)) {
    openaiMessages.push({
      role: msg.role,
      content: msg.content,
    })
  }

  // Add current message
  openaiMessages.push({ role: 'user', content: contactMessage })

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { error: 'OPENAI_API_KEY not configured' }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: agent.model || 'gpt-4o-mini',
        messages: openaiMessages,
        temperature: agent.temperature || 0.7,
        max_tokens: agent.max_tokens || 500,
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      logger.error(LOG_PREFIX, 'OpenAI API error', errData)
      return { error: `OpenAI API error: ${response.status}` }
    }

    const data = await response.json()
    const aiResponse = data.choices?.[0]?.message?.content || ''

    // Check if AI is uncertain (handoff indicators)
    const uncertaintyIndicators = [
      'nao sei responder',
      'nao tenho certeza',
      'preciso de ajuda',
      'falar com um atendente',
      'transferir para',
      'nao consigo ajudar',
    ]

    const isUncertain = uncertaintyIndicators.some((indicator) =>
      aiResponse.toLowerCase().includes(indicator)
    )

    if (isUncertain) {
      return {
        data: {
          response: aiResponse,
          shouldHandoff: true,
          handoffReason: 'IA indicou incerteza na resposta',
        },
      }
    }

    // Update agent stats
    await supabaseAdmin
      .from('ai_agents')
      .update({
        total_messages: (agent.total_messages || 0) + 1,
      })
      .eq('id', aiAgentId)

    return { data: { response: aiResponse, shouldHandoff: false } }
  } catch (err) {
    logger.error(LOG_PREFIX, 'AI generation failed', err)
    return { error: 'Failed to generate AI response' }
  }
}

// =============================================
// COPILOT SUGGESTION
// =============================================

export async function getCopilotSuggestion(
  conversationId: string,
  organizationId: string,
  aiAgentId: string,
  contactMessage: string,
  contactName?: string
): Promise<ServiceResult<{ suggestion: string }>> {
  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', aiAgentId)
    .eq('organization_id', organizationId)
    .single()

  if (!agent) {
    return { error: 'AI agent not found' }
  }

  // Conhecimento (knowledge_base legado) migrou para ai_agent_sources/ai_agent_chunks (RAG);
  // ai_agents não tem coluna knowledge_base, então o bloco abaixo fica vazio por padrão.
  const systemPrompt = `Voce e um assistente copilot para atendentes de WhatsApp.
Seu objetivo e sugerir respostas que o atendente pode enviar ao cliente.
Baseie-se no contexto da conversa e no knowledge base da empresa.
Responda em portugues do Brasil.
Seja direto e objetivo.

${agent.knowledge_base ? `Knowledge Base:\n${agent.knowledge_base}` : ''}

IMPORTANTE: Voce esta SUGERINDO uma resposta para o ATENDENTE enviar.
Nao fale como se voce fosse o atendente. Sugira a mensagem pronta.`

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { error: 'OPENAI_API_KEY not configured' }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `O cliente ${contactName || ''} disse: "${contactMessage}"\n\nSugira uma resposta para o atendente enviar:`,
          },
        ],
        temperature: 0.5,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      return { error: `OpenAI error: ${response.status}` }
    }

    const data = await response.json()
    const suggestion = data.choices?.[0]?.message?.content || ''

    return { data: { suggestion } }
  } catch (err) {
    logger.error(LOG_PREFIX, 'Copilot suggestion failed', err)
    return { error: 'Failed to generate suggestion' }
  }
}

// =============================================
// PROCESS AI AUTO-RESPONSE
// =============================================

export async function processAIAutoResponse(
  conversationId: string,
  organizationId: string,
  instanceId: string,
  contactPhone: string,
  contactMessage: string,
  contactName?: string
): Promise<void> {
  // Get conversation with AI config
  const { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('bot_active, ai_agent_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single()

  if (!conv || !conv.bot_active || !conv.ai_agent_id) return

  // Get recent message history
  const { data: recentMessages } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('direction, content, sender_type')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10)

  const history = (recentMessages || [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content || '',
    }))

  // Generate AI response
  const result = await generateAIResponse({
    conversationId,
    organizationId,
    aiAgentId: conv.ai_agent_id,
    contactMessage,
    contactName,
    messageHistory: history,
  })

  if (!result.data) return

  const { response, shouldHandoff, handoffReason } = result.data

  if (shouldHandoff) {
    // Disable bot and notify
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({ bot_active: false })
      .eq('id', conversationId)

    // Insert system message
    await supabaseAdmin.from('whatsapp_messages').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: 'outbound',
      message_type: 'system',
      content: `Bot desativado: ${handoffReason}. Conversa transferida para atendimento humano.`,
      sender_type: 'system',
      status: 'sent',
      is_from_me: true,
      is_internal_note: true,
    })

    return
  }

  if (response) {
    // Send the AI response
    const { sendMessage } = await import('./message-service')
    await sendMessage({
      conversationId,
      organizationId,
      instanceId,
      to: contactPhone,
      messageType: 'text',
      content: response,
      senderType: 'bot',
      senderName: 'AI Assistant',
    })
  }
}

// =============================================
// HELPERS
// =============================================

function buildSystemPrompt(agent: AIAgent, contactName?: string): string {
  let prompt = agent.system_prompt || ''

  // Add knowledge base
  if (agent.knowledge_base) {
    prompt += `\n\nBase de conhecimento da empresa:\n${agent.knowledge_base}`
  }

  // Add agent type context
  switch (agent.agent_type) {
    case 'sales':
      prompt += '\n\nVoce e um agente de vendas. Foco em conversao, upsell e recomendacao de produtos.'
      break
    case 'support':
      prompt += '\n\nVoce e um agente de suporte. Foco em resolver problemas rapidamente e com empatia.'
      break
    case 'post_sale':
      prompt += '\n\nVoce e um agente de pos-venda. Foco em satisfacao, fidelizacao e feedback.'
      break
  }

  // Add contact context
  if (contactName) {
    prompt += `\n\nNome do cliente: ${contactName}`
  }

  prompt += '\n\nIMPORTANTE: Responda em portugues do Brasil. Seja conciso e profissional.'
  prompt += '\nSe nao souber responder algo, diga que vai transferir para um atendente humano.'

  return prompt
}
