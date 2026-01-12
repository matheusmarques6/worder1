// =====================================================
// ENVIO DE MENSAGENS WHATSAPP
// Wrapper para Evolution API
// =====================================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { 
  sendTypingIndicator, 
  calculateTypingTime,
  simulateHumanResponse 
} from './typing'

// Re-exportar funções de typing para conveniência
export { 
  sendTypingIndicator, 
  calculateTypingTime,
  simulateHumanResponse,
  calculateReadingTime,
  waitWithTyping,
  delay,
} from './typing'

// =====================================================
// TIPOS
// =====================================================

interface SendMessageParams {
  instanceName: string    // Nome/ID único da instância Evolution
  phone: string           // Número sem @s.whatsapp.net
  message: string         // Texto da mensagem
  quotedMessageId?: string // ID da mensagem para responder (quote)
}

interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

// =====================================================
// ENVIAR MENSAGEM VIA EVOLUTION API
// =====================================================

/**
 * Envia mensagem de texto via Evolution API
 */
export async function sendWhatsAppMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { instanceName, phone, message, quotedMessageId } = params

  const evolutionUrl = process.env.EVOLUTION_API_URL
  const evolutionKey = process.env.EVOLUTION_API_KEY

  if (!evolutionUrl || !evolutionKey) {
    console.error('[SendMessage] ❌ Evolution API não configurada')
    return { success: false, error: 'Evolution API não configurada' }
  }

  try {
    // Formatar número (remover caracteres não numéricos)
    const formattedPhone = phone.replace(/\D/g, '')
    
    console.log(`[SendMessage] 📤 Enviando para ${formattedPhone} via ${instanceName}`)

    const response = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: message,
        // Se tiver mensagem para responder (quote)
        ...(quotedMessageId && {
          quoted: {
            key: {
              id: quotedMessageId
            }
          }
        })
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('[SendMessage] ❌ Erro Evolution API:', response.status, errorData)
      return { success: false, error: `HTTP ${response.status}: ${errorData}` }
    }

    const data = await response.json()
    const messageId = data?.key?.id

    console.log('[SendMessage] ✅ Mensagem enviada:', messageId)

    return {
      success: true,
      messageId,
    }

  } catch (error: any) {
    console.error('[SendMessage] ❌ Erro ao enviar:', error)
    return { success: false, error: error.message }
  }
}

// =====================================================
// SALVAR MENSAGEM NO BANCO
// =====================================================

/**
 * Salva mensagem enviada no banco de dados
 */
export async function saveOutboundMessage(params: {
  organizationId: string
  conversationId: string
  contactId: string
  content: string
  messageId?: string
  metadata?: Record<string, any>
}): Promise<{ success: boolean; error?: string }> {
  const { organizationId, conversationId, contactId, content, messageId, metadata } = params

  try {
    // Inserir mensagem
    const { error: insertError } = await supabaseAdmin.from('whatsapp_messages').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      contact_id: contactId,
      wamid: messageId,
      wa_message_id: messageId,
      direction: 'outbound',
      message_type: 'text',
      content: content,
      status: 'sent',
      metadata: {
        ...metadata,
        sent_at: new Date().toISOString(),
      },
    })

    if (insertError) {
      console.error('[SendMessage] ❌ Erro ao salvar mensagem:', insertError)
      return { success: false, error: insertError.message }
    }

    // Atualizar last_message na conversa
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
      })
      .eq('id', conversationId)

    return { success: true }

  } catch (error: any) {
    console.error('[SendMessage] ❌ Erro ao salvar mensagem:', error)
    return { success: false, error: error.message }
  }
}

// =====================================================
// FUNÇÃO COMBINADA: ENVIAR E SALVAR
// =====================================================

/**
 * Envia mensagem via WhatsApp e salva no banco
 */
export async function sendAndSaveMessage(params: {
  instanceName: string
  phone: string
  message: string
  organizationId: string
  conversationId: string
  contactId: string
  quotedMessageId?: string
  metadata?: Record<string, any>
}): Promise<SendMessageResult> {
  const { 
    instanceName, 
    phone, 
    message, 
    organizationId, 
    conversationId, 
    contactId, 
    quotedMessageId,
    metadata 
  } = params

  // 1. Enviar via WhatsApp
  const sendResult = await sendWhatsAppMessage({
    instanceName,
    phone,
    message,
    quotedMessageId,
  })

  // 2. Salvar no banco (mesmo se falhou, para log)
  await saveOutboundMessage({
    organizationId,
    conversationId,
    contactId,
    content: message,
    messageId: sendResult.messageId,
    metadata: {
      ...metadata,
      send_success: sendResult.success,
      send_error: sendResult.error,
    },
  })

  return sendResult
}
