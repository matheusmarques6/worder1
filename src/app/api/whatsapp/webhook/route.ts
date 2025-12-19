import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (!mode && !token && !challenge) {
    return NextResponse.json({ 
      status: 'ok', 
      message: 'WhatsApp Webhook Endpoint Active',
      timestamp: new Date().toISOString()
    })
  }

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'worder-whatsapp-verify'

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.event === 'messages.upsert' || body.event === 'MESSAGES_UPSERT') {
      await processMessage(body)
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ status: 'error' }, { status: 200 })
  }
}

async function processMessage(body: any) {
  const instanceName = body.instance
  const data = body.data

  // 1. Buscar instância
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('unique_id', instanceName)
    .single()

  if (!instance) return

  const orgId = instance.organization_id
  const key = data.key
  const message = data.message

  // Ignorar mensagens próprias
  if (key?.fromMe) return

  const remoteJid = key?.remoteJid
  if (!remoteJid || remoteJid.includes('@g.us')) return

  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '')
  const pushName = data.pushName || phoneNumber
  
  // Extrair conteúdo
  let content = message?.conversation || 
                message?.extendedTextMessage?.text || 
                message?.imageMessage?.caption ||
                '[Mídia]'
  
  let messageType = 'text'
  if (message?.imageMessage) messageType = 'image'
  if (message?.audioMessage) messageType = 'audio'
  if (message?.videoMessage) messageType = 'video'
  if (message?.documentMessage) messageType = 'document'

  // 2. Buscar ou criar contato
  let { data: contact } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', phoneNumber)
    .single()

  if (!contact) {
    const { data: newContact } = await supabase
      .from('whatsapp_contacts')
      .insert({
        organization_id: orgId,
        phone_number: phoneNumber,
        name: pushName,
        profile_name: pushName,
      })
      .select()
      .single()
    contact = newContact
  }

  if (!contact) return

  // 3. Buscar ou criar conversa
  let { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('*, agent:ai_agents(*)')
    .eq('organization_id', orgId)
    .eq('contact_id', contact.id)
    .eq('status', 'open')
    .single()

  if (!conversation) {
    const { data: newConv } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        contact_id: contact.id,
        phone_number: phoneNumber,
        status: 'open',
        is_bot_active: false,
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: 1,
      })
      .select()
      .single()
    conversation = newConv
  } else {
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq('id', conversation.id)
  }

  if (!conversation) return

  // 4. Salvar mensagem recebida
  await supabase
    .from('whatsapp_messages')
    .insert({
      organization_id: orgId,
      conversation_id: conversation.id,
      contact_id: contact.id,
      wamid: key?.id,
      wa_message_id: key?.id,
      direction: 'inbound',
      message_type: messageType,
      content: content,
      status: 'received',
      metadata: { pushName },
    })

  // 5. Se bot ativo, gerar resposta com IA
  if (conversation.is_bot_active && conversation.ai_agent_id) {
    await generateAndSendAIResponse(
      instance,
      conversation,
      contact,
      content,
      phoneNumber,
      orgId
    )
  }
}

async function generateAndSendAIResponse(
  instance: any,
  conversation: any,
  contact: any,
  userMessage: string,
  phoneNumber: string,
  orgId: string
) {
  try {
    // Buscar agente
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', conversation.ai_agent_id)
      .single()

    if (!agent) return

    // Verificar se bot foi parado durante o processamento
    const { data: currentConv } = await supabase
      .from('whatsapp_conversations')
      .select('is_bot_active, bot_stopped_at')
      .eq('id', conversation.id)
      .single()

    if (!currentConv?.is_bot_active) {
      console.log('Bot was stopped, skipping AI response')
      return
    }

    // Buscar histórico de mensagens (últimas 10)
    const { data: history } = await supabase
      .from('whatsapp_messages')
      .select('direction, content')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Montar mensagens para a IA
    const messages: any[] = [
      { role: 'system', content: agent.system_prompt }
    ]

    // Adicionar histórico em ordem cronológica
    if (history) {
      const reversedHistory = [...history].reverse()
      for (const msg of reversedHistory) {
        if (msg.content && msg.content !== '[Mídia]') {
          messages.push({
            role: msg.direction === 'inbound' ? 'user' : 'assistant',
            content: msg.content
          })
        }
      }
    }

    // Verificar novamente se bot foi parado
    const { data: checkConv } = await supabase
      .from('whatsapp_conversations')
      .select('is_bot_active')
      .eq('id', conversation.id)
      .single()

    if (!checkConv?.is_bot_active) {
      console.log('Bot was stopped before AI call, skipping')
      return
    }

    // Chamar API de IA (suporta múltiplos providers)
    const aiResponse = await callAIProvider(agent, messages)

    if (!aiResponse) return

    // Verificar MAIS UMA VEZ se bot foi parado
    const { data: finalCheck } = await supabase
      .from('whatsapp_conversations')
      .select('is_bot_active')
      .eq('id', conversation.id)
      .single()

    if (!finalCheck?.is_bot_active) {
      console.log('Bot was stopped before sending, skipping')
      return
    }

    // Enviar mensagem via Evolution API
    const sendResponse = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance.unique_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': instance.api_key || EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: phoneNumber,
        text: aiResponse,
      }),
    })

    const sendData = await sendResponse.json()

    // Salvar mensagem do bot no banco
    await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: orgId,
        conversation_id: conversation.id,
        contact_id: contact.id,
        direction: 'outbound',
        message_type: 'text',
        content: aiResponse,
        status: sendResponse.ok ? 'sent' : 'failed',
        wamid: sendData?.key?.id,
        wa_message_id: sendData?.key?.id,
        metadata: { 
          ai_generated: true,
          agent_id: agent.id,
          agent_name: agent.name,
        },
      })

    // Atualizar preview da conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: aiResponse.substring(0, 100),
      })
      .eq('id', conversation.id)

  } catch (error) {
    console.error('AI Response error:', error)
  }
}

// Função para chamar diferentes providers de IA
async function callAIProvider(agent: any, messages: any[]): Promise<string | null> {
  const provider = agent.provider || 'openai'
  const apiKey = agent.api_key

  if (!apiKey) {
    console.error('No API key configured for agent')
    return null
  }

  try {
    switch (provider) {
      case 'openai': {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: agent.model || 'gpt-4o-mini',
            messages: messages,
            temperature: agent.temperature || 0.7,
            max_tokens: agent.max_tokens || 500,
          }),
        })
        const data = await response.json()
        return data.choices?.[0]?.message?.content || null
      }

      case 'anthropic': {
        // Converter mensagens para formato Anthropic
        const systemPrompt = messages.find(m => m.role === 'system')?.content || ''
        const chatMessages = messages.filter(m => m.role !== 'system')
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: agent.model || 'claude-3-haiku-20240307',
            max_tokens: agent.max_tokens || 500,
            system: systemPrompt,
            messages: chatMessages,
          }),
        })
        const data = await response.json()
        return data.content?.[0]?.text || null
      }

      case 'groq': {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: agent.model || 'llama-3.1-8b-instant',
            messages: messages,
            temperature: agent.temperature || 0.7,
            max_tokens: agent.max_tokens || 500,
          }),
        })
        const data = await response.json()
        return data.choices?.[0]?.message?.content || null
      }

      case 'google': {
        // Google Gemini
        const systemPrompt = messages.find(m => m.role === 'system')?.content || ''
        const chatMessages = messages.filter(m => m.role !== 'system')
        
        const contents = chatMessages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${agent.model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: contents,
              generationConfig: {
                temperature: agent.temperature || 0.7,
                maxOutputTokens: agent.max_tokens || 500,
              },
            }),
          }
        )
        const data = await response.json()
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null
      }

      default:
        console.error('Unknown provider:', provider)
        return null
    }
  } catch (error) {
    console.error('AI Provider error:', error)
    return null
  }
}
