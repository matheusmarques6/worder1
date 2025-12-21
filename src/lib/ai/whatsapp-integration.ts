// =====================================================
// INTEGRAÇÃO DO AGENTE DE IA COM WHATSAPP
// Helper para ser usado no webhook do WhatsApp
// =====================================================

import { createClient } from '@supabase/supabase-js'
import { createAgentEngine } from './engine'
import { EngineMessage, EngineResponse } from './types'

// =====================================================
// TIPOS
// =====================================================

interface WhatsAppMessage {
  id: string
  content: string
  direction: 'inbound' | 'outbound'
  timestamp: Date
}

interface ProcessWhatsAppParams {
  organizationId: string
  conversationId: string
  message: string
  messageHistory: WhatsAppMessage[]
  channelId?: string
  pipelineStageId?: string
  contactInfo?: {
    name?: string
    phone?: string
    email?: string
  }
}

interface ProcessWhatsAppResult {
  shouldRespond: boolean
  response?: string
  wasTransferred: boolean
  transferTo?: string
  agentId?: string
  error?: string
}

// =====================================================
// FUNÇÃO PRINCIPAL
// =====================================================

/**
 * Processa mensagem do WhatsApp com agente de IA
 */
export async function processWhatsAppWithAgent(
  params: ProcessWhatsAppParams
): Promise<ProcessWhatsAppResult> {
  const {
    organizationId,
    conversationId,
    message,
    messageHistory,
    channelId,
    pipelineStageId,
    contactInfo,
  } = params

  try {
    const supabase = getSupabase()

    // 1. Buscar agente ativo para esta conversa
    const { data: agentData, error: agentError } = await supabase
      .rpc('get_active_agent_for_conversation', {
        p_organization_id: organizationId,
        p_channel_id: channelId || null,
        p_pipeline_stage_id: pipelineStageId || null,
      })

    if (agentError || !agentData || agentData.length === 0) {
      // Nenhum agente ativo para esta conversa
      return { shouldRespond: false, wasTransferred: false }
    }

    const activeAgent = agentData[0]
    const agentId = activeAgent.agent_id

    // 2. Buscar agente completo
    const { data: agent, error: fetchError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .single()

    if (fetchError || !agent) {
      return { shouldRespond: false, wasTransferred: false, error: 'Agent not found' }
    }

    // 3. Verificar cooldown
    const { data: cooldownOk } = await supabase
      .rpc('check_agent_cooldown', {
        p_agent_id: agentId,
        p_conversation_id: conversationId,
      })

    if (!cooldownOk) {
      return { shouldRespond: false, wasTransferred: false }
    }

    // 4. Verificar limite de mensagens
    const maxMessages = agent.settings?.behavior?.max_messages_per_conversation || 0
    if (maxMessages > 0) {
      const { data: msgCount } = await supabase
        .rpc('count_agent_messages_in_conversation', {
          p_agent_id: agentId,
          p_conversation_id: conversationId,
        })

      if ((msgCount || 0) >= maxMessages) {
        return { shouldRespond: false, wasTransferred: false }
      }
    }

    // 5. Verificar stop_on_human_reply
    if (agent.settings?.behavior?.stop_on_human_reply) {
      const hasHumanReply = messageHistory.some(
        msg => msg.direction === 'outbound' && !isAgentMessage(msg, agentId)
      )
      if (hasHumanReply) {
        return { shouldRespond: false, wasTransferred: false }
      }
    }

    // 6. Aplicar delay (reply_delay)
    const replyDelay = agent.persona?.reply_delay || 0
    if (replyDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, replyDelay * 1000))
    }

    // 7. Criar engine e processar
    const engine = await createAgentEngine(agentId, organizationId)

    // Converter histórico para formato do engine
    const engineHistory: EngineMessage[] = messageHistory
      .slice(-20) // Últimas 20 mensagens
      .map(msg => ({
        role: msg.direction === 'inbound' ? 'user' : 'assistant' as const,
        content: msg.content,
      }))

    // Adicionar mensagem atual
    engineHistory.push({ role: 'user', content: message })

    const result = await engine.processMessage({
      conversationId,
      conversationHistory: engineHistory,
      contactInfo,
    })

    // 8. Verificar transferência
    if (result.was_transferred) {
      return {
        shouldRespond: false,
        wasTransferred: true,
        transferTo: result.transfer_to,
        agentId,
      }
    }

    // 9. Retornar resposta
    return {
      shouldRespond: true,
      response: result.response,
      wasTransferred: false,
      agentId,
    }

  } catch (error: any) {
    console.error('Error processing WhatsApp with agent:', error)
    return {
      shouldRespond: false,
      wasTransferred: false,
      error: error.message,
    }
  }
}

// =====================================================
// HELPERS
// =====================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase não configurado')
  }

  return createClient(url, key)
}

/**
 * Verifica se uma mensagem foi enviada pelo agente de IA
 */
function isAgentMessage(msg: WhatsAppMessage, agentId: string): boolean {
  // Implementar lógica para identificar mensagens do agente
  // Pode ser baseado em metadata ou outra lógica
  return false // Por padrão, assume que não é do agente
}

/**
 * Função para ser chamada diretamente do webhook
 */
export async function handleIncomingWhatsAppMessage(
  organizationId: string,
  conversationId: string,
  incomingMessage: string,
  channelId?: string
): Promise<{ reply: string | null; transferred: boolean }> {
  const supabase = getSupabase()

  // Buscar histórico da conversa
  const { data: messages } = await supabase
    .from('whatsapp_messages')
    .select('id, content, direction, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(30)

  const messageHistory: WhatsAppMessage[] = (messages || []).map(m => ({
    id: m.id,
    content: m.content,
    direction: m.direction,
    timestamp: new Date(m.created_at),
  }))

  // Buscar info do contato
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('contact_name, contact_phone, pipeline_stage_id')
    .eq('id', conversationId)
    .single()

  const result = await processWhatsAppWithAgent({
    organizationId,
    conversationId,
    message: incomingMessage,
    messageHistory,
    channelId,
    pipelineStageId: conversation?.pipeline_stage_id,
    contactInfo: {
      name: conversation?.contact_name,
      phone: conversation?.contact_phone,
    },
  })

  return {
    reply: result.shouldRespond ? result.response || null : null,
    transferred: result.wasTransferred,
  }
}
