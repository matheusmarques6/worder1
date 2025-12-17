// =============================================
// WEBHOOK WHATSAPP - Com IA Integrada
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateWhatsAppResponse } from '@/lib/whatsapp/ai-providers';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';

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
    const { data: waConfig } = await supabase
      .from('whatsapp_accounts')
      .select('*, organization:organizations(*)')
      .eq('phone_number_id', phoneNumberId)
      .single();

    // Fallback para whatsapp_configs
    let config = waConfig;
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
        await processMessageStatus(orgId, status);
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
  let { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', senderPhone)
    .single();

  if (!conversation) {
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
        unread_count: (conversation.unread_count || 0) + 1,
        last_message_at: timestamp,
        last_message_preview: content.substring(0, 100),
        status: conversation.status === 'closed' ? 'open' : conversation.status,
      })
      .eq('id', conversation.id);
  }

  // Salvar mensagem
  const { data: savedMessage } = await supabase
    .from('whatsapp_messages')
    .insert({
      conversation_id: conversation!.id,
      wa_message_id: message.id,
      direction: 'inbound',
      type: messageType,
      content,
      media_url: mediaUrl || null,
      status: 'received',
      sent_at: timestamp,
    })
    .select()
    .single();

  console.log(`💬 Message saved: ${conversation!.id} - ${content.substring(0, 50)}`);

  // Verificar se deve responder automaticamente
  if (conversation!.is_bot_active) {
    // Verificar se bot não está temporariamente desabilitado
    if (conversation!.bot_disabled_until) {
      const disabledUntil = new Date(conversation!.bot_disabled_until);
      if (disabledUntil > new Date()) {
        console.log('⏸️ Bot temporarily disabled');
        return;
      }
    }

    // Tentar chatbot de fluxo primeiro
    const usedFlow = await triggerChatbot(orgId, conversation!, savedMessage!, content);

    // Se não usou fluxo, tentar IA
    if (!usedFlow) {
      await triggerAIResponse(orgId, waConfig, conversation!, content);
    }
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

    // Gerar resposta
    const response = await generateWhatsAppResponse({
      config: {
        provider: aiConfig.provider,
        apiKey,
        model: aiConfig.model,
        systemPrompt: aiConfig.system_prompt,
        temperature: aiConfig.temperature,
        maxTokens: aiConfig.max_tokens,
      },
      conversationHistory: history || [],
      userMessage,
      contactName: conversation.contact_name,
    });

    if (response) {
      // Enviar resposta
      const phoneNumberId = waConfig.phone_number_id;
      const accessToken = waConfig.access_token;

      const result = await sendTextMessage({
        phoneNumberId,
        accessToken,
        to: conversation.phone_number,
        content: response,
      });

      // Salvar mensagem de resposta
      if (result.messages?.[0]?.id) {
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
// TRIGGER CHATBOT (FLUXO)
// =============================================
async function triggerChatbot(orgId: string, conversation: any, message: any, content: string): Promise<boolean> {
  try {
    const { data: chatbot } = await supabase
      .from('whatsapp_chatbots')
      .select('*, flow:whatsapp_flows(*)')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!chatbot || !chatbot.flow) return false;

    // Verificar trigger
    if (chatbot.trigger_type === 'keyword' && chatbot.trigger_keywords?.length > 0) {
      const lowerContent = content.toLowerCase();
      const hasKeyword = chatbot.trigger_keywords.some((kw: string) => 
        lowerContent.includes(kw.toLowerCase())
      );
      if (!hasKeyword) return false;
    }

    // Buscar ou criar sessão de fluxo
    let { data: session } = await supabase
      .from('whatsapp_flow_sessions')
      .select('*')
      .eq('conversation_id', conversation.id)
      .eq('flow_id', chatbot.flow_id)
      .eq('status', 'active')
      .single();

    if (!session) {
      const startNode = chatbot.flow.nodes?.find((n: any) => n.type === 'START');
      
      const { data: newSession } = await supabase
        .from('whatsapp_flow_sessions')
        .insert({
          organization_id: orgId,
          flow_id: chatbot.flow_id,
          chatbot_id: chatbot.id,
          conversation_id: conversation.id,
          origin: 'META',
          sender_mobile: conversation.phone_number,
          current_node_id: startNode?.id || 'start_1',
          session_data: {},
          status: 'active',
        })
        .select()
        .single();

      session = newSession;
    }

    // Processar fluxo
    await processFlowNode(orgId, conversation, chatbot.flow, session, content);
    return true;

  } catch (error) {
    console.error('❌ Chatbot trigger error:', error);
    return false;
  }
}

// =============================================
// PROCESSAR NÓ DO FLUXO
// =============================================
async function processFlowNode(orgId: string, conversation: any, flow: any, session: any, userInput: string) {
  const nodes = flow.nodes || [];
  const currentNode = nodes.find((n: any) => n.id === session.current_node_id);

  if (!currentNode) return;

  // Buscar config WhatsApp
  let { data: waConfig } = await supabase
    .from('whatsapp_accounts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .single();

  if (!waConfig) {
    const { data: altConfig } = await supabase
      .from('whatsapp_configs')
      .select('*')
      .eq('organization_id', orgId)
      .single();
    waConfig = altConfig;
  }

  if (!waConfig) return;

  let nextNodeId = null;
  const edges = flow.edges || [];

  switch (currentNode.type) {
    case 'START':
      const startEdge = edges.find((e: any) => e.source === currentNode.id);
      nextNodeId = startEdge?.target;
      break;

    case 'MESSAGE':
      if (currentNode.data?.content) {
        await sendWAMessage(waConfig, conversation.phone_number, currentNode.data.content, conversation.id);
      }
      const msgEdge = edges.find((e: any) => e.source === currentNode.id);
      nextNodeId = msgEdge?.target;
      break;

    case 'QUESTION':
      if (userInput && session.session_data?.waitingForAnswer) {
        const options = currentNode.data?.options || [];
        const answerIndex = options.findIndex((opt: string) => 
          opt.toLowerCase().includes(userInput.toLowerCase()) ||
          userInput === String(options.indexOf(opt) + 1)
        );
        
        const questionEdges = edges.filter((e: any) => e.source === currentNode.id);
        nextNodeId = questionEdges[answerIndex]?.target || questionEdges[0]?.target;
      } else {
        if (currentNode.data?.content) {
          let questionText = currentNode.data.content;
          if (currentNode.data?.options?.length > 0) {
            questionText += '\n\n' + currentNode.data.options.map((opt: string, i: number) => `${i + 1}. ${opt}`).join('\n');
          }
          await sendWAMessage(waConfig, conversation.phone_number, questionText, conversation.id);
        }
        await supabase
          .from('whatsapp_flow_sessions')
          .update({ session_data: { ...session.session_data, waitingForAnswer: true } })
          .eq('id', session.id);
        return;
      }
      break;

    case 'DELAY':
      const delay = (currentNode.data?.delay || 0) * 1000;
      await new Promise(resolve => setTimeout(resolve, Math.min(delay, 5000)));
      const delayEdge = edges.find((e: any) => e.source === currentNode.id);
      nextNodeId = delayEdge?.target;
      break;

    case 'AI':
      // Usar IA para responder
      await triggerAIResponse(orgId, waConfig, conversation, userInput);
      const aiEdge = edges.find((e: any) => e.source === currentNode.id);
      nextNodeId = aiEdge?.target;
      break;

    case 'END':
      await supabase
        .from('whatsapp_flow_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', session.id);
      return;
  }

  if (nextNodeId) {
    await supabase
      .from('whatsapp_flow_sessions')
      .update({ 
        current_node_id: nextNodeId,
        session_data: { ...session.session_data, waitingForAnswer: false },
        last_interaction_at: new Date().toISOString()
      })
      .eq('id', session.id);

    const updatedSession = { ...session, current_node_id: nextNodeId, session_data: { ...session.session_data, waitingForAnswer: false } };
    await processFlowNode(orgId, conversation, flow, updatedSession, '');
  }
}

// =============================================
// ENVIAR MENSAGEM WHATSAPP
// =============================================
async function sendWAMessage(waConfig: any, to: string, text: string, conversationId: string) {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${waConfig.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waConfig.access_token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    const result = await response.json();
    
    if (result.messages?.[0]?.id) {
      // Salvar mensagem enviada
      await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: conversationId,
          wa_message_id: result.messages[0].id,
          direction: 'outbound',
          type: 'text',
          content: text,
          status: 'sent',
          sent_at: new Date().toISOString(),
        });
    }

    return result;
  } catch (error) {
    console.error('❌ sendWAMessage error:', error);
  }
}

// =============================================
// PROCESSAR STATUS DE MENSAGEM
// =============================================
async function processMessageStatus(orgId: string, status: any) {
  const waMessageId = status.id;
  const statusValue = status.status;

  await supabase
    .from('whatsapp_messages')
    .update({ status: statusValue })
    .eq('wa_message_id', waMessageId);

  // Atualizar log de campanha se aplicável
  if (waMessageId) {
    const updateData: any = { delivery_status: statusValue };
    
    if (statusValue === 'delivered') {
      updateData.delivery_time = new Date().toISOString();
    } else if (statusValue === 'read') {
      updateData.read_time = new Date().toISOString();
    }

    const { data: log } = await supabase
      .from('whatsapp_campaign_logs')
      .update(updateData)
      .eq('meta_message_id', waMessageId)
      .select()
      .single();

    if (log) {
      if (statusValue === 'delivered') {
        await supabase.rpc('increment_campaign_delivered', { p_campaign_id: log.campaign_id });
      } else if (statusValue === 'read') {
        await supabase.rpc('increment_campaign_read', { p_campaign_id: log.campaign_id });
      }
    }
  }

  console.log(`📊 Status: ${waMessageId} -> ${statusValue}`);
}
