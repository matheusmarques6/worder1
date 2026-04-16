// src/app/api/ai/process/route.ts
// Rota para processar mensagens de IA chamada pelo webhook do Evolution
// NÃO requer autenticação via cookies - recebe organization_id no body

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// POST - Processar mensagem com IA e responder via WhatsApp
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      conversation_id,
      message,
      contact_id,
      unified_contact_id,
      organization_id,
      instance_id,
    } = body

    console.log('[AI Process] Received:', { conversation_id, message: message?.substring(0, 50), organization_id })

    // Validação básica
    if (!conversation_id || !message || !organization_id) {
      return NextResponse.json({ 
        error: 'Missing required fields: conversation_id, message, organization_id' 
      }, { status: 400 })
    }

    // 1. Buscar conversa e verificar se IA está habilitada
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*, instance:whatsapp_instances(id, name, instance_name, api_url, api_key, status)')
      .eq('id', conversation_id)
      .single()

    if (convError || !conversation) {
      console.error('[AI Process] Conversation not found:', convError)
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Verificar se IA está habilitada
    if (!conversation.ai_enabled) {
      console.log('[AI Process] AI disabled for conversation:', conversation_id)
      return NextResponse.json({ message: 'AI disabled for this conversation' }, { status: 200 })
    }

    // 2. Buscar configuração do agente de IA
    let aiConfig: any = null
    
    // Tentar buscar agente específico da conversa
    if (conversation.ai_agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id, name, ai_config')
        .eq('id', conversation.ai_agent_id)
        .single()

      if (agent?.ai_config) {
        aiConfig = agent.ai_config
        console.log('[AI Process] Using agent config:', agent.name)
      }
    }

    // Se não tem agente específico, buscar agente padrão da organização
    if (!aiConfig) {
      const { data: defaultAgent } = await supabase
        .from('agents')
        .select('id, name, ai_config')
        .eq('organization_id', organization_id)
        .eq('is_default', true)
        .eq('is_active', true)
        .single()

      if (defaultAgent?.ai_config) {
        aiConfig = defaultAgent.ai_config
        console.log('[AI Process] Using default agent:', defaultAgent.name)
      }
    }

    // Fallback: usar config padrão
    if (!aiConfig) {
      aiConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: `Você é um assistente virtual de atendimento ao cliente. 
Seja educado, prestativo e objetivo. Responda em português brasileiro.
Se não souber a resposta, diga que vai verificar com a equipe.`,
        temperature: 0.3,
        max_tokens: 500,
      }
      console.log('[AI Process] Using fallback config')
    }

    // 3. Buscar API key da organização
    const { data: apiKeyData } = await supabase
      .from('organization_api_keys')
      .select('api_key, base_url')
      .eq('organization_id', organization_id)
      .eq('provider', aiConfig.provider)
      .eq('is_valid', true)
      .single()

    if (!apiKeyData) {
      console.error('[AI Process] API key not found for provider:', aiConfig.provider)
      return NextResponse.json({ 
        error: `API key not found for ${aiConfig.provider}` 
      }, { status: 400 })
    }

    // 4. Buscar contexto das últimas mensagens
    const { data: recentMessages } = await supabase
      .from('whatsapp_messages')
      .select('content, is_from_me, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const context = (recentMessages || []).reverse().map(msg => ({
      role: msg.is_from_me ? 'assistant' : 'user',
      content: msg.content || '',
    }))

    // 5. Montar mensagens para a IA
    const messages = [
      { role: 'system', content: aiConfig.system_prompt },
      ...context,
      { role: 'user', content: message },
    ]

    // 6. Chamar provider de IA
    let aiResponse: string
    
    const aiCallStart = Date.now()
    try {
      switch (aiConfig.provider) {
        case 'openai':
          aiResponse = await callOpenAI(apiKeyData.api_key, aiConfig.model, messages, aiConfig.temperature, aiConfig.max_tokens)
          break
        case 'anthropic':
          aiResponse = await callAnthropic(apiKeyData.api_key, aiConfig.model, messages, aiConfig.temperature, aiConfig.max_tokens)
          break
        case 'groq':
          aiResponse = await callGroq(apiKeyData.api_key, aiConfig.model, messages, aiConfig.temperature, aiConfig.max_tokens)
          break
        default:
          aiResponse = await callOpenAI(apiKeyData.api_key, aiConfig.model, messages, aiConfig.temperature, aiConfig.max_tokens)
      }
    } catch (aiError: any) {
      // Track failed call too
      try {
        const { trackAiUsage } = await import('@/lib/ai/cost-tracker')
        await trackAiUsage({
          organizationId: organization_id,
          provider: aiConfig.provider, model: aiConfig.model,
          feature: 'whatsapp_ai_process', agentId: aiConfig.agent_id,
          conversationId: conversation_id, success: false,
          error: aiError?.message, durationMs: Date.now() - aiCallStart,
        })
      } catch { /* silent */ }
      console.error('[AI Process] AI call failed:', aiError)
      return NextResponse.json({ error: 'AI provider error: ' + aiError.message }, { status: 500 })
    }

    // Track successful AI call
    const aiDuration = Date.now() - aiCallStart
    try {
      const { trackAiUsage } = await import('@/lib/ai/cost-tracker')
      // Estima tokens (~4 chars per token)
      const estPrompt = Math.ceil(JSON.stringify(messages).length / 4)
      const estCompletion = Math.ceil((aiResponse || '').length / 4)
      await trackAiUsage({
        organizationId: organization_id,
        provider: aiConfig.provider, model: aiConfig.model,
        feature: 'whatsapp_ai_process',
        agentId: aiConfig.agent_id,
        conversationId: conversation_id,
        promptTokens: estPrompt, completionTokens: estCompletion,
        durationMs: aiDuration,
      })
    } catch { /* silent */ }

    if (!aiResponse) {
      console.error('[AI Process] Empty AI response')
      return NextResponse.json({ error: 'Empty AI response' }, { status: 500 })
    }

    console.log('[AI Process] AI response:', aiResponse.substring(0, 100))

    // 7. Enviar resposta via Evolution API
    const instance = conversation.instance
    if (!instance || instance.status !== 'connected') {
      console.error('[AI Process] Instance not connected:', instance?.status)
      return NextResponse.json({ error: 'WhatsApp instance not connected' }, { status: 400 })
    }

    const phoneNumber = conversation.phone_number.replace(/\D/g, '')
    const evolutionUrl = `${instance.api_url}/message/sendText/${instance.instance_name}`

    const sendResponse = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': instance.api_key,
      },
      body: JSON.stringify({
        number: phoneNumber,
        text: aiResponse,
      }),
    })

    if (!sendResponse.ok) {
      const error = await sendResponse.text()
      console.error('[AI Process] Failed to send message:', error)
      return NextResponse.json({ error: 'Failed to send WhatsApp message' }, { status: 500 })
    }

    const sendResult = await sendResponse.json()
    console.log('[AI Process] Message sent:', sendResult.key?.id)

    // 8. Salvar mensagem no banco
    const messageId = sendResult.key?.id || `ai_${Date.now()}`
    
    await supabase.from('whatsapp_messages').insert({
      id: messageId,
      organization_id,
      conversation_id,
      instance_id: instance.id,
      message_id: messageId,
      content: aiResponse,
      message_type: 'text',
      is_from_me: true,
      status: 'sent',
      remote_jid: sendResult.key?.remoteJid || `${phoneNumber}@s.whatsapp.net`,
      sender_name: 'IA',
      metadata: {
        ai_generated: true,
        ai_provider: aiConfig.provider,
        ai_model: aiConfig.model,
      },
    })

    // 9. Atualizar conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: aiResponse.substring(0, 100),
        last_message_direction: 'outbound',
      })
      .eq('id', conversation_id)

    return NextResponse.json({
      success: true,
      message_id: messageId,
      response: aiResponse.substring(0, 100) + '...',
    })

  } catch (error: any) {
    console.error('[AI Process] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PROVIDERS
// =====================================================

async function callOpenAI(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'OpenAI API error')
  }

  const data = await res.json()
  return data.choices[0]?.message?.content || ''
}

async function callAnthropic(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number): Promise<string> {
  // Separar system message
  const systemMessage = messages.find(m => m.role === 'system')?.content || ''
  const userMessages = messages.filter(m => m.role !== 'system')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemMessage,
      messages: userMessages,
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'Anthropic API error')
  }

  const data = await res.json()
  return data.content[0]?.text || ''
}

async function callGroq(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'Groq API error')
  }

  const data = await res.json()
  return data.choices[0]?.message?.content || ''
}
