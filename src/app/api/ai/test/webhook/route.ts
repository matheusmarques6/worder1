// =====================================================
// SIMULADOR DE WEBHOOK WHATSAPP
// Testa o fluxo completo da IA sem WhatsApp real
// /api/ai/test/webhook
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// =====================================================
// GET - Instruções de uso
// =====================================================

export async function GET() {
  return NextResponse.json({
    status: 'Simulador de Webhook WhatsApp',
    description: 'Testa o fluxo completo da IA sem enviar mensagem real ao WhatsApp',
    usage: {
      method: 'POST',
      body: {
        organizationId: 'uuid (obrigatório)',
        phoneNumber: '5511999999999 (obrigatório)',
        message: 'Olá, preciso de ajuda (obrigatório)',
        instanceId: 'uuid da instância (opcional - usa primeira disponível)',
        contactName: 'Nome do contato (opcional)',
        skipWhatsAppSend: 'true para não enviar no WhatsApp real (default: true)',
      },
      example: {
        organizationId: '123e4567-e89b-12d3-a456-426614174000',
        phoneNumber: '5511999999999',
        message: 'Qual o preço do produto X?',
      }
    },
    endpoints_related: {
      '/api/ai/test': 'Testes gerais (Redis, cache, agentes)',
      '/api/ai/test/webhook': 'Este simulador',
      '/api/whatsapp/webhook': 'Webhook real (Evolution API)',
    }
  })
}

// =====================================================
// POST - Simular mensagem recebida
// =====================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { 
      organizationId, 
      phoneNumber, 
      message,
      instanceId,
      contactName = 'Teste Simulador',
      skipWhatsAppSend = true,
    } = body

    // Validar campos obrigatórios
    if (!organizationId) {
      return NextResponse.json({
        error: 'Campo obrigatório: organizationId',
        hint: 'Use o ID da sua organização no Supabase'
      }, { status: 400 })
    }

    if (!phoneNumber) {
      return NextResponse.json({
        error: 'Campo obrigatório: phoneNumber',
        hint: 'Formato: 5511999999999 (com código do país)'
      }, { status: 400 })
    }

    if (!message) {
      return NextResponse.json({
        error: 'Campo obrigatório: message',
        hint: 'A mensagem que você quer testar'
      }, { status: 400 })
    }

    console.log(`[Simulador] 🧪 Iniciando teste: ${phoneNumber} -> "${message.substring(0, 50)}..."`)

    // =====================================================
    // 1. BUSCAR OU USAR INSTÂNCIA
    // =====================================================
    let instance
    
    if (instanceId) {
      const { data } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('*')
        .eq('id', instanceId)
        .single()
      instance = data
    } else {
      // Buscar primeira instância da organização
      const { data } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', organizationId)
        .limit(1)
      instance = data?.[0]
    }

    if (!instance) {
      return NextResponse.json({
        error: 'Nenhuma instância WhatsApp encontrada',
        hint: 'Conecte uma instância WhatsApp primeiro ou forneça instanceId válido',
        organizationId,
      }, { status: 404 })
    }

    console.log(`[Simulador] 📱 Instância: ${instance.unique_id}`)

    // =====================================================
    // 2. BUSCAR OU CRIAR CONTATO
    // =====================================================
    let { data: contact } = await supabaseAdmin
      .from('whatsapp_contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('phone_number', phoneNumber)
      .single()

    if (!contact) {
      const { data: newContact, error: contactError } = await supabaseAdmin
        .from('whatsapp_contacts')
        .insert({
          organization_id: organizationId,
          phone_number: phoneNumber,
          name: contactName,
          profile_name: contactName,
        })
        .select()
        .single()
      
      if (contactError) {
        return NextResponse.json({
          error: 'Erro ao criar contato',
          details: contactError.message,
        }, { status: 500 })
      }
      
      contact = newContact
      console.log(`[Simulador] 👤 Novo contato criado: ${contact.id}`)
    } else {
      console.log(`[Simulador] 👤 Contato existente: ${contact.id}`)
    }

    // =====================================================
    // 3. BUSCAR OU CRIAR CONVERSA
    // =====================================================
    let { data: conversation } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('phone_number', phoneNumber)
      .single()

    if (!conversation) {
      const { data: newConv, error: convError } = await supabaseAdmin
        .from('whatsapp_conversations')
        .insert({
          organization_id: organizationId,
          contact_id: contact.id,
          phone_number: phoneNumber,
          status: 'open',
          ai_enabled: true,
          last_message_at: new Date().toISOString(),
          last_message_preview: message.substring(0, 100),
        })
        .select()
        .single()
      
      if (convError) {
        return NextResponse.json({
          error: 'Erro ao criar conversa',
          details: convError.message,
        }, { status: 500 })
      }
      
      conversation = newConv
      console.log(`[Simulador] 💬 Nova conversa criada: ${conversation.id}`)
    } else {
      // Garantir que IA está habilitada para o teste
      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({ 
          ai_enabled: true,
          last_message_at: new Date().toISOString(),
          last_message_preview: message.substring(0, 100),
        })
        .eq('id', conversation.id)
      
      console.log(`[Simulador] 💬 Conversa existente: ${conversation.id}`)
    }

    // =====================================================
    // 4. SALVAR MENSAGEM DE ENTRADA (SIMULADA)
    // =====================================================
    const simulatedMessageId = `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    await supabaseAdmin.from('whatsapp_messages').insert({
      organization_id: organizationId,
      conversation_id: conversation.id,
      contact_id: contact.id,
      wamid: simulatedMessageId,
      wa_message_id: simulatedMessageId,
      direction: 'inbound',
      message_type: 'text',
      content: message,
      status: 'received',
      metadata: { 
        simulated: true, 
        simulator: 'api/ai/test/webhook',
        timestamp: new Date().toISOString(),
      },
    })

    console.log(`[Simulador] 📥 Mensagem salva: ${simulatedMessageId}`)

    // =====================================================
    // 5. PROCESSAR COM IA
    // =====================================================
    const { processWebhookWithAI } = await import('@/lib/ai/webhook-processor')

    // Se skipWhatsAppSend, vamos mockar o envio
    let aiResult
    
    if (skipWhatsAppSend) {
      // Processar sem enviar WhatsApp real
      aiResult = await processWebhookWithAISimulated({
        organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        instanceId: instance.id,
        instanceName: instance.unique_id,
        phoneNumber,
        message,
        messageId: simulatedMessageId,
        contactName,
      })
    } else {
      // Processar com envio real ao WhatsApp
      aiResult = await processWebhookWithAI({
        organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        instanceId: instance.id,
        instanceName: instance.unique_id,
        phoneNumber,
        message,
        messageId: simulatedMessageId,
        contactName,
      })
    }

    const totalTime = Date.now() - startTime

    // =====================================================
    // 6. RETORNAR RESULTADO
    // =====================================================
    return NextResponse.json({
      success: true,
      simulation: true,
      whatsapp_sent: !skipWhatsAppSend && aiResult.replied,
      
      input: {
        phoneNumber,
        message,
        contactName,
      },
      
      result: {
        processed: aiResult.processed,
        replied: aiResult.replied,
        transferred: aiResult.transferred,
        response: aiResult.response,
        error: aiResult.error,
        agentId: aiResult.agentId,
        agentName: aiResult.agentName,
      },
      
      context: {
        organizationId,
        instanceId: instance.id,
        instanceName: instance.unique_id,
        contactId: contact.id,
        conversationId: conversation.id,
        messageId: simulatedMessageId,
      },
      
      timing: {
        totalTimeMs: totalTime,
      },
      
      links: {
        conversation: `/whatsapp/conversations/${conversation.id}`,
        contact: `/whatsapp/contacts/${contact.id}`,
      }
    })

  } catch (error: any) {
    console.error('[Simulador] ❌ Erro:', error)
    return NextResponse.json({ 
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 })
  }
}

// =====================================================
// PROCESSADOR SIMULADO (SEM ENVIO WHATSAPP)
// =====================================================

async function processWebhookWithAISimulated(params: {
  organizationId: string
  conversationId: string
  contactId: string
  instanceId: string
  instanceName: string
  phoneNumber: string
  message: string
  messageId?: string
  contactName?: string
}): Promise<{
  processed: boolean
  replied: boolean
  transferred: boolean
  response?: string
  error?: string
  agentId?: string
  agentName?: string
}> {
  const {
    organizationId,
    conversationId,
    contactId,
    instanceId,
    phoneNumber,
    message,
    messageId,
  } = params

  console.log(`[Simulador] 🤖 Processando com IA (modo simulado)...`)

  try {
    // 1. Verificar se IA está habilitada
    const { data: conversation } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('ai_enabled, pipeline_stage_id')
      .eq('id', conversationId)
      .single()

    if (conversation?.ai_enabled === false) {
      return { processed: false, replied: false, transferred: false, error: 'IA desabilitada para esta conversa' }
    }

    // 2. Buscar agente ativo
    const { data: agentData } = await supabaseAdmin
      .rpc('get_active_agent_for_conversation', {
        p_organization_id: organizationId,
        p_channel_id: instanceId,
        p_pipeline_stage_id: conversation?.pipeline_stage_id || null,
      })

    if (!agentData || agentData.length === 0) {
      return { processed: false, replied: false, transferred: false, error: 'Nenhum agente ativo encontrado' }
    }

    const agentId = agentData[0].agent_id
    const agentName = agentData[0].agent_name

    console.log(`[Simulador] 🤖 Agente: ${agentName}`)

    // 3. Processar com motor de IA
    const { handleIncomingWhatsAppMessage } = await import('@/lib/ai/whatsapp-integration')

    const aiResult = await handleIncomingWhatsAppMessage(
      organizationId,
      conversationId,
      message,
      instanceId
    )

    // 4. Se transferido, marcar conversa
    if (aiResult.transferred) {
      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          ai_enabled: false,
          ai_disabled_at: new Date().toISOString(),
          ai_disabled_reason: 'transferred_to_human',
        })
        .eq('id', conversationId)

      return {
        processed: true,
        replied: false,
        transferred: true,
        agentId,
        agentName,
      }
    }

    // 5. Se tem resposta, salvar no banco (mas NÃO enviar WhatsApp)
    if (aiResult.reply) {
      const simulatedReplyId = `SIM_REPLY_${Date.now()}`
      
      await supabaseAdmin.from('whatsapp_messages').insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        contact_id: contactId,
        wamid: simulatedReplyId,
        wa_message_id: simulatedReplyId,
        direction: 'outbound',
        message_type: 'text',
        content: aiResult.reply,
        status: 'simulated', // Marcar como simulado
        metadata: {
          sent_by: 'ai_agent',
          agent_id: agentId,
          agent_name: agentName,
          simulated: true,
          in_reply_to: messageId,
        },
      })

      console.log(`[Simulador] 💾 Resposta salva (não enviada ao WhatsApp)`)

      return {
        processed: true,
        replied: true,
        transferred: false,
        response: aiResult.reply,
        agentId,
        agentName,
      }
    }

    return {
      processed: true,
      replied: false,
      transferred: false,
      agentId,
      agentName,
    }

  } catch (error: any) {
    console.error('[Simulador] ❌ Erro no processamento:', error)
    return {
      processed: false,
      replied: false,
      transferred: false,
      error: error.message,
    }
  }
}
