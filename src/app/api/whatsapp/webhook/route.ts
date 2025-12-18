// =============================================
// WEBHOOK WHATSAPP - Com IA Integrada
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Verificação do Webhook (Meta Challenge)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'worder-whatsapp-verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WhatsApp webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST - Receber mensagens e eventos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('📥 WhatsApp Webhook:', JSON.stringify(body, null, 2));

    const entry = body.entry?.[0];
    if (!entry) return NextResponse.json({ status: 'ok' });

    const changes = entry.changes?.[0];
    if (!changes) return NextResponse.json({ status: 'ok' });

    const value = changes.value;
    const phoneNumberId = value.metadata?.phone_number_id;

    // Buscar config pelo phone_number_id
    let config: any = null;
    
    const { data: waConfig } = await supabase
      .from('whatsapp_accounts')
      .select('*, organization:organizations(*)')
      .eq('phone_number_id', phoneNumberId)
      .single();

    config = waConfig;

    // Fallback para whatsapp_configs
    if (!config) {
      const { data: altConfig } = await supabase
        .from('whatsapp_configs')
        .select('*')
        .eq('phone_number_id', phoneNumberId)
        .single();
      config = altConfig;
    }

    if (!config) {
      console.log('⚠️ Config not found for:', phoneNumberId);
      return NextResponse.json({ status: 'ok' });
    }

    const orgId = config.organization_id;

    // Processar mensagens
    if (value.messages) {
      for (const message of value.messages) {
        await processIncomingMessage(orgId, config, message, value.contacts?.[0]);
      }
    }

    // Processar status de entrega
    if (value.statuses) {
      for (const status of value.statuses) {
        await processMessageStatus(status);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 200 });
  }
}

// =============================================
// PROCESSAR MENSAGEM RECEBIDA
// =============================================
async function processIncomingMessage(orgId: string, waConfig: any, message: any, contact: any) {
  const senderPhone = message.from;
  const messageType = message.type;
  const timestamp = new Date(parseInt(message.timestamp) * 1000).toISOString();

  // Extrair conteúdo
  let content = '';
  let mediaUrl = '';
  
  switch (messageType) {
    case 'text':
      content = message.text?.body || '';
      break;
    case 'image':
      content = message.image?.caption || '[Imagem]';
      mediaUrl = message.image?.id;
      break;
    case 'video':
      content = message.video?.caption || '[Vídeo]';
      mediaUrl = message.video?.id;
      break;
    case 'audio':
      content = '[Áudio]';
      mediaUrl = message.audio?.id;
      break;
    case 'document':
      content = message.document?.filename || '[Documento]';
      mediaUrl = message.document?.id;
      break;
    case 'location':
      content = `📍 ${message.location?.latitude}, ${message.location?.longitude}`;
      break;
    case 'contacts':
      content = `👤 ${message.contacts?.[0]?.name?.formatted_name || 'Contato'}`;
      break;
    case 'button':
      content = message.button?.text || '';
      break;
    case 'interactive':
      content = message.interactive?.button_reply?.title || 
                message.interactive?.list_reply?.title || '';
      break;
    default:
      content = `[${messageType}]`;
  }

  // Buscar ou criar conversa
  let conversation: any = null;
  
  const { data: existingConv } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', senderPhone)
    .single();

  if (!existingConv) {
    const { data: newConv } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        phone_number: senderPhone,
        contact_name: contact?.profile?.name || null,
        status: 'open',
        is_bot_active: true,
        unread_count: 1,
        last_message_at: timestamp,
        last_message_preview: content.substring(0, 100),
      })
      .select()
      .single();
    
    conversation = newConv;
  } else {
    await supabase
      .from('whatsapp_conversations')
      .update({
        unread_count: (existingConv.unread_count || 0) + 1,
        last_message_at: timestamp,
        last_message_preview: content.substring(0, 100),
        status: existingConv.status === 'closed' ? 'open' : existingConv.status,
      })
      .eq('id', existingConv.id);
    
    conversation = existingConv;
  }

  if (!conversation) {
    console.error('Failed to create/get conversation');
    return;
  }

  // Salvar mensagem
  await supabase
    .from('whatsapp_messages')
    .insert({
      conversation_id: conversation.id,
      wa_message_id: message.id,
      direction: 'inbound',
      type: messageType,
      content,
      media_url: mediaUrl || null,
      status: 'received',
      sent_at: timestamp,
    });

  console.log(`💬 Message saved: ${conversation.id} - ${content.substring(0, 50)}`);

  // Verificar se deve responder automaticamente com IA
  if (conversation.is_bot_active) {
    if (conversation.bot_disabled_until) {
      const disabledUntil = new Date(conversation.bot_disabled_until);
      if (disabledUntil > new Date()) {
        console.log('⏸️ Bot temporarily disabled');
        return;
      }
    }

    await triggerAIResponse(orgId, waConfig, conversation, content);
  }
}

// =============================================
// TRIGGER AI RESPONSE
// =============================================
async function triggerAIResponse(orgId: string, waConfig: any, conversation: any, userMessage: string) {
  try {
    // Buscar config de AI ativa
    const { data: aiConfig } = await supabase
      .from('whatsapp_ai_configs')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!aiConfig) {
      console.log('🤖 No AI config found');
      return;
    }

    // Descriptografar API key
    const apiKey = Buffer.from(aiConfig.api_key_encrypted, 'base64').toString('utf-8');

    // Buscar histórico
    const { data: history } = await supabase
      .from('whatsapp_messages')
      .select('direction, content')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(20);

    // Gerar resposta com IA
    const response = await generateAIResponse({
      provider: aiConfig.provider,
      apiKey,
      model: aiConfig.model,
      systemPrompt: aiConfig.system_prompt,
      temperature: aiConfig.temperature,
      maxTokens: aiConfig.max_tokens,
      conversationHistory: history || [],
      userMessage,
      contactName: conversation.contact_name,
    });

    if (response) {
      // Enviar resposta via WhatsApp
      const phoneNumberId = waConfig.phone_number_id;
      const accessToken = waConfig.access_token;

      const result = await sendWhatsAppMessage(
        phoneNumberId, 
        accessToken, 
        conversation.phone_number, 
        response
      );

      // Salvar mensagem de resposta
      if (result?.messages?.[0]?.id) {
        await supabase
          .from('whatsapp_messages')
          .insert({
            conversation_id: conversation.id,
            wa_message_id: result.messages[0].id,
            direction: 'outbound',
            type: 'text',
            content: response,
            status: 'sent',
            sent_at: new Date().toISOString(),
          });

        console.log(`🤖 AI response sent: ${response.substring(0, 50)}...`);
      }
    }
  } catch (error) {
    console.error('❌ AI response error:', error);
  }
}

// =============================================
// GERAR RESPOSTA COM IA
// =============================================
async function generateAIResponse(params: {
  provider: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  conversationHistory: any[];
  userMessage: string;
  contactName?: string;
}): Promise<string | null> {
  const { provider, apiKey, model, systemPrompt, temperature, maxTokens, conversationHistory, userMessage, contactName } = params;

  const defaultPrompt = `Você é um assistente virtual amigável de atendimento ao cliente via WhatsApp.
${contactName ? `O cliente se chama ${contactName}.` : ''}
Regras:
- Seja cordial e profissional
- Respostas curtas e diretas
- Use emojis com moderação
- Se não souber a resposta, ofereça transferir para um atendente humano`;

  const messages = [
    { role: 'system', content: systemPrompt || defaultPrompt },
    ...conversationHistory.slice(-10).map((msg: any) => ({
      role: msg.direction === 'outbound' ? 'assistant' : 'user',
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  try {
    let aiResponse = '';

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens ?? 1000,
        }),
      });
      const data = await response.json();
      aiResponse = data.choices?.[0]?.message?.content || '';
    } 
    else if (provider === 'anthropic') {
      const systemMsg = messages.find(m => m.role === 'system');
      const chatMsgs = messages.filter(m => m.role !== 'system');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-haiku-20240307',
          max_tokens: maxTokens ?? 1000,
          system: systemMsg?.content || '',
          messages: chatMsgs,
        }),
      });
      const data = await response.json();
      aiResponse = data.content?.[0]?.text || '';
    }
    else if (provider === 'gemini') {
      const systemMsg = messages.find(m => m.role === 'system');
      const chatMsgs = messages.filter(m => m.role !== 'system');

      const contents = chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
            generationConfig: {
              temperature: temperature ?? 0.7,
              maxOutputTokens: maxTokens ?? 1000,
            },
          }),
        }
      );
      const data = await response.json();
      aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return aiResponse || null;
  } catch (error) {
    console.error('AI generation error:', error);
    return null;
  }
}

// =============================================
// ENVIAR MENSAGEM WHATSAPP
// =============================================
async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, to: string, text: string) {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    return await response.json();
  } catch (error) {
    console.error('❌ sendWhatsAppMessage error:', error);
    return null;
  }
}

// =============================================
// PROCESSAR STATUS DE MENSAGEM
// =============================================
async function processMessageStatus(status: any) {
  const waMessageId = status.id;
  const statusValue = status.status; // sent, delivered, read, failed
  const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000).toISOString() : new Date().toISOString();

  // Atualizar mensagem do inbox
  await supabase
    .from('whatsapp_messages')
    .update({ status: statusValue })
    .eq('wa_message_id', waMessageId);

  // =============================================
  // ATUALIZAR RECIPIENT DE CAMPANHA
  // =============================================
  if (waMessageId) {
    // Buscar recipient pelo meta_message_id
    const { data: recipient } = await supabase
      .from('whatsapp_campaign_recipients')
      .select('id, campaign_id, status')
      .eq('meta_message_id', waMessageId)
      .single();

    if (recipient) {
      const updateData: Record<string, any> = {};
      let newStatus = recipient.status;

      switch (statusValue) {
        case 'sent':
          if (['pending', 'queued'].includes(recipient.status)) {
            newStatus = 'sent';
            updateData.sent_at = timestamp;
          }
          break;
          
        case 'delivered':
          if (['pending', 'queued', 'sent'].includes(recipient.status)) {
            newStatus = 'delivered';
            updateData.delivered_at = timestamp;
          }
          break;
          
        case 'read':
          if (['pending', 'queued', 'sent', 'delivered'].includes(recipient.status)) {
            newStatus = 'read';
            updateData.read_at = timestamp;
          }
          break;
          
        case 'failed':
          newStatus = 'failed';
          updateData.failed_at = timestamp;
          updateData.error_code = status.errors?.[0]?.code || 'UNKNOWN';
          updateData.error_message = status.errors?.[0]?.message || status.errors?.[0]?.title || 'Failed';
          break;
      }

      if (Object.keys(updateData).length > 0 || newStatus !== recipient.status) {
        updateData.status = newStatus;
        
        await supabase
          .from('whatsapp_campaign_recipients')
          .update(updateData)
          .eq('id', recipient.id);

        // Atualizar métricas da campanha
        await updateCampaignMetrics(recipient.campaign_id);
        
        console.log(`📊 Campaign recipient updated: ${recipient.id} -> ${newStatus}`);
      }
    }

    // Também atualizar tabela antiga de logs (compatibilidade)
    const legacyUpdateData: Record<string, any> = { delivery_status: statusValue };
    
    if (statusValue === 'delivered') {
      legacyUpdateData.delivery_time = timestamp;
    } else if (statusValue === 'read') {
      legacyUpdateData.read_time = timestamp;
    }

    await supabase
      .from('whatsapp_campaign_logs')
      .update(legacyUpdateData)
      .eq('meta_message_id', waMessageId);
  }

  console.log(`📊 Status: ${waMessageId} -> ${statusValue}`);
}

// =============================================
// ATUALIZAR MÉTRICAS DA CAMPANHA
// =============================================
async function updateCampaignMetrics(campaignId: string) {
  try {
    // Contar por status
    const { data: recipients } = await supabase
      .from('whatsapp_campaign_recipients')
      .select('status')
      .eq('campaign_id', campaignId);

    if (!recipients) return;

    const stats = {
      total_sent: 0,
      total_delivered: 0,
      total_read: 0,
      total_failed: 0
    };

    recipients.forEach(r => {
      switch (r.status) {
        case 'sent':
          stats.total_sent++;
          break;
        case 'delivered':
          stats.total_sent++;
          stats.total_delivered++;
          break;
        case 'read':
          stats.total_sent++;
          stats.total_delivered++;
          stats.total_read++;
          break;
        case 'failed':
          stats.total_failed++;
          break;
      }
    });

    await supabase
      .from('whatsapp_campaigns')
      .update({
        ...stats,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

  } catch (error) {
    console.error('Error updating campaign metrics:', error);
  }
}
