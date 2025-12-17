import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role para bypassa RLS
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
    console.log('WhatsApp webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST - Receber mensagens e eventos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Log para debug
    console.log('WhatsApp Webhook received:', JSON.stringify(body, null, 2));

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

    if (!waConfig) {
      console.log('WhatsApp config not found for:', phoneNumberId);
      return NextResponse.json({ status: 'ok' });
    }

    const orgId = waConfig.organization_id;

    // Processar mensagens
    if (value.messages) {
      for (const message of value.messages) {
        await processIncomingMessage(orgId, waConfig, message, value.contacts?.[0]);
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
    console.error('WhatsApp webhook error:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 200 });
  }
}

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
      mediaUrl = message.image?.id; // Precisaria buscar URL via API
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
    // Criar nova conversa
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
    // Atualizar conversa
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

  // Verificar se deve executar chatbot
  if (conversation!.is_bot_active) {
    await triggerChatbot(orgId, conversation!, savedMessage!, content);
  }

  console.log(`Message saved: ${conversation!.id} - ${content.substring(0, 50)}`);
}

async function processMessageStatus(orgId: string, status: any) {
  const waMessageId = status.id;
  const statusValue = status.status; // sent, delivered, read, failed

  // Atualizar mensagem
  const { data: message } = await supabase
    .from('whatsapp_messages')
    .update({ status: statusValue })
    .eq('wa_message_id', waMessageId)
    .select()
    .single();

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

    // Incrementar contadores da campanha
    if (log) {
      if (statusValue === 'delivered') {
        await supabase.rpc('increment_campaign_delivered', { p_campaign_id: log.campaign_id });
      } else if (statusValue === 'read') {
        await supabase.rpc('increment_campaign_read', { p_campaign_id: log.campaign_id });
      }
    }
  }

  console.log(`Status updated: ${waMessageId} -> ${statusValue}`);
}

async function triggerChatbot(orgId: string, conversation: any, message: any, content: string) {
  try {
    // Buscar chatbot ativo
    const { data: chatbot } = await supabase
      .from('whatsapp_chatbots')
      .select('*, flow:whatsapp_flows(*)')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!chatbot || !chatbot.flow) return;

    // Verificar trigger
    if (chatbot.trigger_type === 'keyword' && chatbot.trigger_keywords?.length > 0) {
      const lowerContent = content.toLowerCase();
      const hasKeyword = chatbot.trigger_keywords.some((kw: string) => 
        lowerContent.includes(kw.toLowerCase())
      );
      if (!hasKeyword) return;
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
      // Criar nova sessão
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

  } catch (error) {
    console.error('Chatbot trigger error:', error);
  }
}

async function processFlowNode(orgId: string, conversation: any, flow: any, session: any, userInput: string) {
  const nodes = flow.nodes || [];
  const currentNode = nodes.find((n: any) => n.id === session.current_node_id);

  if (!currentNode) return;

  // Buscar config WhatsApp para enviar respostas
  const { data: waConfig } = await supabase
    .from('whatsapp_accounts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .single();

  if (!waConfig) return;

  let nextNodeId = null;
  const edges = flow.edges || [];

  switch (currentNode.type) {
    case 'START':
      // Ir para próximo nó
      const startEdge = edges.find((e: any) => e.source === currentNode.id);
      nextNodeId = startEdge?.target;
      break;

    case 'MESSAGE':
      // Enviar mensagem
      if (currentNode.data?.content) {
        await sendWhatsAppMessage(waConfig, conversation.phone_number, currentNode.data.content);
      }
      // Ir para próximo nó
      const msgEdge = edges.find((e: any) => e.source === currentNode.id);
      nextNodeId = msgEdge?.target;
      break;

    case 'QUESTION':
      // Se tem input do usuário, processar resposta
      if (userInput && session.session_data?.waitingForAnswer) {
        // Encontrar edge baseado na resposta
        const options = currentNode.data?.options || [];
        const answerIndex = options.findIndex((opt: string) => 
          opt.toLowerCase().includes(userInput.toLowerCase()) ||
          userInput === String(options.indexOf(opt) + 1)
        );
        
        const questionEdges = edges.filter((e: any) => e.source === currentNode.id);
        nextNodeId = questionEdges[answerIndex]?.target || questionEdges[0]?.target;
      } else {
        // Enviar pergunta
        if (currentNode.data?.content) {
          let questionText = currentNode.data.content;
          if (currentNode.data?.options?.length > 0) {
            questionText += '\n\n' + currentNode.data.options.map((opt: string, i: number) => `${i + 1}. ${opt}`).join('\n');
          }
          await sendWhatsAppMessage(waConfig, conversation.phone_number, questionText);
        }
        // Marcar como aguardando resposta
        await supabase
          .from('whatsapp_flow_sessions')
          .update({ session_data: { ...session.session_data, waitingForAnswer: true } })
          .eq('id', session.id);
        return; // Aguardar resposta do usuário
      }
      break;

    case 'DELAY':
      // Em produção, usaria um scheduler
      const delay = (currentNode.data?.delay || 0) * 1000;
      await new Promise(resolve => setTimeout(resolve, Math.min(delay, 5000)));
      const delayEdge = edges.find((e: any) => e.source === currentNode.id);
      nextNodeId = delayEdge?.target;
      break;

    case 'END':
      // Finalizar sessão
      await supabase
        .from('whatsapp_flow_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', session.id);
      return;
  }

  // Atualizar sessão e processar próximo nó
  if (nextNodeId) {
    await supabase
      .from('whatsapp_flow_sessions')
      .update({ 
        current_node_id: nextNodeId,
        session_data: { ...session.session_data, waitingForAnswer: false },
        last_interaction_at: new Date().toISOString()
      })
      .eq('id', session.id);

    // Processar próximo nó
    const updatedSession = { ...session, current_node_id: nextNodeId, session_data: { ...session.session_data, waitingForAnswer: false } };
    await processFlowNode(orgId, conversation, flow, updatedSession, '');
  }
}

async function sendWhatsAppMessage(waConfig: any, to: string, text: string) {
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
    
    if (!response.ok) {
      console.error('Error sending WA message:', result);
    }

    return result;
  } catch (error) {
    console.error('sendWhatsAppMessage error:', error);
  }
}
