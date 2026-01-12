// =====================================================
// PROCESSADOR DE IA PARA WEBHOOK WHATSAPP
// Liga o webhook ao motor de IA
// =====================================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { 
  sendAndSaveMessage, 
  simulateHumanResponse 
} from '@/lib/whatsapp/send-message'

// =====================================================
// TIPOS
// =====================================================

interface WebhookProcessorParams {
  organizationId: string
  conversationId: string
  contactId: string
  instanceId: string       // ID da instância no banco
  instanceName: string     // unique_id da instância (para Evolution API)
  phoneNumber: string      // Número do cliente
  message: string          // Conteúdo da mensagem
  messageId?: string       // ID da mensagem original (para quote)
  contactName?: string     // Nome do contato
}

interface WebhookProcessorResult {
  processed: boolean
  replied: boolean
  transferred: boolean
  response?: string
  error?: string
  agentId?: string
  agentName?: string
}

// =====================================================
// FUNÇÃO PRINCIPAL
// =====================================================

/**
 * Processa mensagem recebida com IA e responde automaticamente
 */
export async function processWebhookWithAI(
  params: WebhookProcessorParams
): Promise<WebhookProcessorResult> {
  const {
    organizationId,
    conversationId,
    contactId,
    instanceId,
    instanceName,
    phoneNumber,
    message,
    messageId,
    contactName,
  } = params

  console.log(`[WebhookAI] 🤖 Processando: ${phoneNumber} -> "${message.substring(0, 50)}..."`)

  try {
    // =====================================================
    // 1. VERIFICAR SE IA ESTÁ HABILITADA PARA ESTA CONVERSA
    // =====================================================
    const { data: conversation } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('ai_enabled, ai_agent_id, pipeline_stage_id')
      .eq('id', conversationId)
      .single()

    if (conversation?.ai_enabled === false) {
      console.log('[WebhookAI] ⏸️ IA desabilitada para esta conversa')
      return { processed: false, replied: false, transferred: false }
    }

    // =====================================================
    // 2. BUSCAR AGENTE ATIVO PARA ESTA CONVERSA
    // =====================================================
    const { data: agentData, error: agentError } = await supabaseAdmin
      .rpc('get_active_agent_for_conversation', {
        p_organization_id: organizationId,
        p_channel_id: instanceId,
        p_pipeline_stage_id: conversation?.pipeline_stage_id || null,
      })

    if (agentError) {
      console.error('[WebhookAI] ❌ Erro ao buscar agente:', agentError)
    }

    if (!agentData || agentData.length === 0) {
      console.log('[WebhookAI] ℹ️ Nenhum agente ativo para esta conversa')
      return { processed: false, replied: false, transferred: false }
    }

    const activeAgent = agentData[0]
    const agentId = activeAgent.agent_id
    const agentName = activeAgent.agent_name

    console.log(`[WebhookAI] 🤖 Agente encontrado: ${agentName} (${agentId})`)

    // =====================================================
    // 3. VERIFICAR COOLDOWN
    // =====================================================
    const { data: cooldownOk } = await supabaseAdmin
      .rpc('check_agent_cooldown', {
        p_agent_id: agentId,
        p_conversation_id: conversationId,
      })

    if (cooldownOk === false) {
      console.log('[WebhookAI] ⏳ Cooldown ativo, aguardando...')
      return { processed: false, replied: false, transferred: false }
    }

    // =====================================================
    // 4. BUSCAR CONFIGURAÇÕES DO AGENTE
    // =====================================================
    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .single()

    if (fetchError || !agent) {
      console.error('[WebhookAI] ❌ Agente não encontrado:', fetchError)
      return { processed: false, replied: false, transferred: false, error: 'Agent not found' }
    }

    // =====================================================
    // 5. VERIFICAR LIMITE DE MENSAGENS
    // =====================================================
    const maxMessages = agent.settings?.behavior?.max_messages_per_conversation || 0
    
    if (maxMessages > 0) {
      const { data: msgCount } = await supabaseAdmin
        .rpc('count_agent_messages_in_conversation', {
          p_agent_id: agentId,
          p_conversation_id: conversationId,
        })

      if ((msgCount || 0) >= maxMessages) {
        console.log(`[WebhookAI] 🚫 Limite de mensagens atingido: ${msgCount}/${maxMessages}`)
        return { processed: false, replied: false, transferred: false }
      }
    }

    // =====================================================
    // 6. VERIFICAR SE HUMANO JÁ RESPONDEU (stop_on_human_reply)
    // =====================================================
    if (agent.settings?.behavior?.stop_on_human_reply) {
      const { data: humanReplied } = await supabaseAdmin
        .rpc('check_human_replied', {
          p_conversation_id: conversationId,
        })

      if (humanReplied === true) {
        console.log('[WebhookAI] 👤 Humano já respondeu, IA pausada')
        return { processed: false, replied: false, transferred: false }
      }
    }

    // =====================================================
    // 7. PROCESSAR COM MOTOR DE IA
    // =====================================================
    console.log('[WebhookAI] 🧠 Processando com motor de IA...')

    const { handleIncomingWhatsAppMessage } = await import('@/lib/ai/whatsapp-integration')

    const aiResult = await handleIncomingWhatsAppMessage(
      organizationId,
      conversationId,
      message,
      instanceId
    )

    console.log('[WebhookAI] 📋 Resultado IA:', {
      hasReply: !!aiResult.reply,
      transferred: aiResult.transferred,
    })

    // =====================================================
    // 9. SE FOI TRANSFERIDO, MARCAR CONVERSA
    // =====================================================
    if (aiResult.transferred) {
      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          ai_enabled: false,
          ai_disabled_at: new Date().toISOString(),
          ai_disabled_reason: 'transferred_to_human',
        })
        .eq('id', conversationId)

      console.log('[WebhookAI] 🔄 Conversa transferida para humano')

      return {
        processed: true,
        replied: false,
        transferred: true,
        agentId,
        agentName,
      }
    }

    // =====================================================
    // 10. SE TEM RESPOSTA, SIMULAR HUMANO E ENVIAR
    // =====================================================
    if (aiResult.reply) {
      // Buscar configuração de delay do agente
      const replyDelay = agent.persona?.reply_delay || 2
      const minDelay = replyDelay * 1000
      const maxDelay = Math.max(minDelay, 6000)

      // Simular comportamento humano (leitura + digitação)
      await simulateHumanResponse(
        instanceName,
        phoneNumber,
        message,           // Mensagem do usuário (para calcular tempo de "leitura")
        aiResult.reply,    // Resposta da IA (para calcular tempo de "digitação")
        {
          skipReading: false,
          minDelay,
          maxDelay,
        }
      )

      // Enviar mensagem
      const sendResult = await sendAndSaveMessage({
        instanceName,
        phone: phoneNumber,
        message: aiResult.reply,
        organizationId,
        conversationId,
        contactId,
        metadata: {
          sent_by: 'ai_agent',
          agent_id: agentId,
          agent_name: agentName,
          in_reply_to: messageId,
        },
      })

      if (!sendResult.success) {
        console.error('[WebhookAI] ❌ Erro ao enviar resposta:', sendResult.error)
        return {
          processed: true,
          replied: false,
          transferred: false,
          response: aiResult.reply,
          error: sendResult.error,
          agentId,
          agentName,
        }
      }

      console.log('[WebhookAI] ✅ Resposta enviada com sucesso!')

      return {
        processed: true,
        replied: true,
        transferred: false,
        response: aiResult.reply,
        agentId,
        agentName,
      }
    }

    // =====================================================
    // 11. NENHUMA RESPOSTA GERADA
    // =====================================================
    console.log('[WebhookAI] ℹ️ Nenhuma resposta gerada')
    
    return {
      processed: true,
      replied: false,
      transferred: false,
      agentId,
      agentName,
    }

  } catch (error: any) {
    console.error('[WebhookAI] ❌ Erro ao processar:', error)
    return {
      processed: false,
      replied: false,
      transferred: false,
      error: error.message,
    }
  }
}
