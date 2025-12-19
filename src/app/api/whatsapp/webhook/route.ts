// =============================================
// WEBHOOK WHATSAPP v8 - Evolution API + Meta Cloud API
// Com IA Integrada e logs detalhados
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Evolution API Config (para enviar mensagens de resposta)
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';

// =============================================
// GET - Verificação do Webhook (Meta Challenge)
// =============================================
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // Também aceitar verificação simples da Evolution
  if (!mode && !token && !challenge) {
    return NextResponse.json({ 
      status: 'ok', 
      message: 'WhatsApp Webhook Endpoint Active',
      timestamp: new Date().toISOString()
    });
  }

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'worder-whatsapp-verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WhatsApp webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// =============================================
// POST - Receber mensagens e eventos
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Log detalhado do evento recebido
    console.log('═══════════════════════════════════════');
    console.log('📥 WEBHOOK RECEIVED:', new Date().toISOString());
    console.log('═══════════════════════════════════════');
    console.log(JSON.stringify(body, null, 2));
    console.log('═══════════════════════════════════════');

    // ========================================
    // EVOLUTION API FORMAT
    // ========================================
    if (body.event || body.instance) {
      console.log('🔵 Detected: EVOLUTION API format');
      return handleEvolutionWebhook(body);
    }

    // ========================================
    // META CLOUD API FORMAT
    // ========================================
    if (body.entry || body.object === 'whatsapp_business_account') {
      console.log('🟢 Detected: META CLOUD API format');
      return handleMetaWebhook(body);
    }

    console.log('⚠️ Unknown webhook format');
    return NextResponse.json({ status: 'ok', message: 'Unknown format' });

  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    // Sempre retornar 200 para não causar retry
    return NextResponse.json({ status: 'error', message: error.message }, { status: 200 });
  }
}

// =============================================
// EVOLUTION API WEBHOOK HANDLER
// =============================================
async function handleEvolutionWebhook(body: any) {
  const event = body.event;
  const instanceName = body.instance;
  const data = body.data;

  console.log(`📱 Evolution Event: ${event}`);
  console.log(`📱 Instance: ${instanceName}`);

  // Buscar instância pelo unique_id
  const { data: instance, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('*, organization_id')
    .eq('unique_id', instanceName)
    .single();

  if (instanceError || !instance) {
    console.log(`⚠️ Instance not found: ${instanceName}`);
    console.log('Error:', instanceError);
    return NextResponse.json({ status: 'ok', message: 'Instance not found' });
  }

  console.log(`✅ Found instance: ${instance.id} (org: ${instance.organization_id})`);

  const orgId = instance.organization_id;

  try {
    switch (event) {
      case 'messages.upsert':
      case 'MESSAGES_UPSERT':
        console.log('📨 Processing MESSAGES_UPSERT');
        await handleEvolutionMessage(orgId, instance, data);
        break;

      case 'messages.update':
      case 'MESSAGES_UPDATE':
        console.log('📊 Processing MESSAGES_UPDATE');
        await handleEvolutionMessageUpdate(data);
        break;

      case 'connection.update':
      case 'CONNECTION_UPDATE':
        console.log('🔌 Processing CONNECTION_UPDATE');
        await handleEvolutionConnectionUpdate(instance, data);
        break;

      case 'qrcode.updated':
      case 'QRCODE_UPDATED':
        console.log('📱 Processing QRCODE_UPDATED');
        await handleEvolutionQRUpdate(instance, data);
        break;

      case 'send.message':
      case 'SEND_MESSAGE':
        console.log('📤 Processing SEND_MESSAGE (outgoing)');
        // Mensagens enviadas por nós - pode ignorar ou logar
        break;

      default:
        console.log(`⏭️ Unhandled event: ${event}`);
    }
  } catch (eventError: any) {
    console.error(`❌ Error processing ${event}:`, eventError);
  }

  return NextResponse.json({ status: 'ok' });
}

// =============================================
// PROCESSAR MENSAGEM DA EVOLUTION
// =============================================
async function handleEvolutionMessage(orgId: string, instance: any, data: any) {
  try {
    const message = data.message || data;
    const key = data.key || message.key;
    
    console.log('📨 Message data:', JSON.stringify(data, null, 2));
    
    // Ignorar mensagens enviadas por nós
    if (key?.fromMe) {
      console.log('⏭️ Skipping own message (fromMe=true)');
      return;
    }

    const remoteJid = key?.remoteJid;
    if (!remoteJid) {
      console.log('⚠️ No remoteJid found');
      return;
    }

    // Ignorar grupos por enquanto
    if (remoteJid.includes('@g.us')) {
      console.log('⏭️ Skipping group message');
      return;
    }

    // Extrair número de telefone
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
    console.log(`📞 Phone number: ${phoneNumber}`);
    
    // Determinar tipo e conteúdo da mensagem
    let messageType = 'text';
    let content = '';
    let mediaUrl = null;

    if (message.conversation) {
      content = message.conversation;
    } else if (message.extendedTextMessage?.text) {
      content = message.extendedTextMessage.text;
    } else if (message.imageMessage) {
      messageType = 'image';
      content = message.imageMessage.caption || '[Imagem]';
      mediaUrl = message.imageMessage.url;
    } else if (message.videoMessage) {
      messageType = 'video';
      content = message.videoMessage.caption || '[Vídeo]';
      mediaUrl = message.videoMessage.url;
    } else if (message.audioMessage) {
      messageType = 'audio';
      content = '[Áudio]';
      mediaUrl = message.audioMessage.url;
    } else if (message.documentMessage) {
      messageType = 'document';
      content = message.documentMessage.fileName || '[Documento]';
      mediaUrl = message.documentMessage.url;
    } else if (message.stickerMessage) {
      messageType = 'sticker';
      content = '[Sticker]';
    } else if (message.locationMessage) {
      messageType = 'location';
      content = `[Localização: ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}]`;
    } else if (message.contactMessage) {
      messageType = 'contact';
      content = `[Contato: ${message.contactMessage.displayName}]`;
    }

    console.log(`📝 Message type: ${messageType}`);
    console.log(`📝 Content: ${content.substring(0, 100)}...`);

    // Buscar nome do contato
    const pushName = data.pushName || message.pushName || phoneNumber;
    console.log(`👤 Push name: ${pushName}`);

    // ========================================
    // BUSCAR OU CRIAR CONTATO
    // ========================================
    let { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('phone_number', phoneNumber)
      .single();

    if (contactError || !contact) {
      console.log('👤 Creating new contact');
      const { data: newContact, error: createError } = await supabase
        .from('whatsapp_contacts')
        .insert({
          organization_id: orgId,
          phone_number: phoneNumber,
          name: pushName,
          profile_name: pushName,
        })
        .select()
        .single();
      
      if (createError) {
        console.error('❌ Error creating contact:', createError);
        return;
      }
      contact = newContact;
      console.log('✅ Contact created:', contact.id);
    } else {
      console.log('✅ Contact found:', contact.id);
    }

    // ========================================
    // BUSCAR OU CRIAR CONVERSA
    // ========================================
    let { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('contact_id', contact.id)
      .eq('status', 'open')
      .single();

    if (convError || !conversation) {
      console.log('💬 Creating new conversation');
      const { data: newConv, error: createConvError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          organization_id: orgId,
          contact_id: contact.id,
          phone_number: phoneNumber,
          status: 'open',
          is_bot_active: true,
          last_message_at: new Date().toISOString(),
          last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
          unread_count: 1,
        })
        .select()
        .single();
      
      if (createConvError) {
        console.error('❌ Error creating conversation:', createConvError);
        return;
      }
      conversation = newConv;
      console.log('✅ Conversation created:', conversation.id);
    } else {
      // Atualizar conversa existente
      console.log('✅ Conversation found:', conversation.id);
      await supabase
        .from('whatsapp_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
          unread_count: (conversation.unread_count || 0) + 1,
        })
        .eq('id', conversation.id);
    }

    // ========================================
    // SALVAR MENSAGEM
    // ========================================
    const { data: savedMessage, error: msgError } = await supabase
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
        media_url: mediaUrl,
        status: 'received',
        metadata: {
          pushName,
          instanceId: instance.id,
          instanceUniqueId: instance.unique_id,
          raw: data,
        },
      })
      .select()
      .single();

    if (msgError) {
      console.error('❌ Error saving message:', msgError);
      return;
    }

    console.log('✅ Message saved:', savedMessage.id);

    // ========================================
    // PROCESSAR BOT/IA SE ATIVO
    // ========================================
    if (conversation.is_bot_active && messageType === 'text' && content) {
      console.log('🤖 Bot is active, processing AI response...');
      await processAIResponse(orgId, instance, conversation, contact, content);
    }

  } catch (error: any) {
    console.error('❌ handleEvolutionMessage error:', error);
  }
}

// =============================================
// PROCESSAR RESPOSTA DE IA
// =============================================
async function processAIResponse(
  orgId: string, 
  instance: any, 
  conversation: any, 
  contact: any, 
  userMessage: string
) {
  try {
    // Buscar configuração de IA da organização
    const { data: aiConfig } = await supabase
      .from('whatsapp_ai_configs')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!aiConfig) {
      console.log('⚠️ No active AI config found');
      return;
    }

    // Buscar histórico recente
    const { data: recentMessages } = await supabase
      .from('whatsapp_messages')
      .select('direction, content, message_type')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const history = (recentMessages || []).reverse();

    // Gerar resposta
    const aiResponse = await generateAIResponse({
      provider: aiConfig.provider,
      apiKey: aiConfig.api_key,
      model: aiConfig.model,
      systemPrompt: aiConfig.system_prompt,
      contactName: contact.name,
      conversationHistory: history,
      userMessage,
      temperature: aiConfig.temperature,
      maxTokens: aiConfig.max_tokens,
    });

    if (aiResponse) {
      // Enviar resposta via Evolution API
      await sendEvolutionMessage(instance, contact.phone_number, aiResponse);

      // Salvar resposta no banco
      await supabase
        .from('whatsapp_messages')
        .insert({
          organization_id: orgId,
          conversation_id: conversation.id,
          contact_id: contact.id,
          direction: 'outbound',
          message_type: 'text',
          content: aiResponse,
          status: 'sent',
          metadata: { ai_generated: true, provider: aiConfig.provider },
        });

      // Atualizar preview da conversa
      await supabase
        .from('whatsapp_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: aiResponse.substring(0, 100),
        })
        .eq('id', conversation.id);

      console.log('✅ AI response sent');
    }
  } catch (error: any) {
    console.error('❌ processAIResponse error:', error);
  }
}

// =============================================
// ENVIAR MENSAGEM VIA EVOLUTION API
// =============================================
async function sendEvolutionMessage(instance: any, phoneNumber: string, text: string) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;

    const response = await fetch(`${apiUrl}/message/sendText/${instance.unique_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: phoneNumber,
        text: text,
      }),
    });

    const data = await response.json();
    console.log('📤 Evolution send response:', data);
    return data;
  } catch (error: any) {
    console.error('❌ sendEvolutionMessage error:', error);
    return null;
  }
}

// =============================================
// GERAR RESPOSTA DE IA
// =============================================
async function generateAIResponse(params: {
  provider: string;
  apiKey: string;
  model?: string;
  systemPrompt?: string;
  contactName?: string;
  conversationHistory: any[];
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const { provider, apiKey, model, systemPrompt, contactName, conversationHistory, userMessage, temperature, maxTokens } = params;

  const defaultPrompt = `Você é um assistente virtual amigável de atendimento ao cliente via WhatsApp.
${contactName ? `O cliente se chama ${contactName}.` : ''}
Regras:
- Seja cordial e profissional
- Respostas curtas e diretas (máximo 3 parágrafos)
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
          max_tokens: maxTokens ?? 500,
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
          max_tokens: maxTokens ?? 500,
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
              maxOutputTokens: maxTokens ?? 500,
            },
          }),
        }
      );
      const data = await response.json();
      aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return aiResponse || null;
  } catch (error) {
    console.error('❌ AI generation error:', error);
    return null;
  }
}

// =============================================
// HANDLERS AUXILIARES
// =============================================

async function handleEvolutionMessageUpdate(data: any) {
  try {
    const key = data.key;
    const update = data.update;
    
    if (!key?.id) return;

    // Atualizar status da mensagem
    if (update?.status) {
      const statusMap: Record<number, string> = {
        0: 'error',
        1: 'pending',
        2: 'sent',
        3: 'delivered',
        4: 'read',
        5: 'played',
      };
      
      const status = statusMap[update.status] || 'unknown';
      
      await supabase
        .from('whatsapp_messages')
        .update({ status })
        .eq('wamid', key.id);

      console.log(`📊 Message ${key.id} status updated to: ${status}`);
    }
  } catch (error) {
    console.error('❌ handleEvolutionMessageUpdate error:', error);
  }
}

async function handleEvolutionConnectionUpdate(instance: any, data: any) {
  try {
    const state = data.state || data.connection;
    console.log(`🔌 Connection state for ${instance.unique_id}: ${state}`);
    
    let status = 'disconnected';
    let onlineStatus = 'unavailable';

    if (state === 'open') {
      status = 'connected';
      onlineStatus = 'available';
    } else if (state === 'connecting') {
      status = 'connecting';
    } else if (state === 'close') {
      status = 'disconnected';
    }

    // Extrair número se disponível
    const phoneNumber = data.ownerJid?.split('@')?.[0] || 
                        data.wuid?.split('@')?.[0] ||
                        null;

    const updateData: any = {
      status,
      online_status: onlineStatus,
      updated_at: new Date().toISOString(),
    };

    if (phoneNumber) {
      updateData.phone_number = phoneNumber;
    }

    await supabase
      .from('whatsapp_instances')
      .update(updateData)
      .eq('id', instance.id);

    console.log(`✅ Instance ${instance.id} updated: ${status}`);
  } catch (error) {
    console.error('❌ handleEvolutionConnectionUpdate error:', error);
  }
}

async function handleEvolutionQRUpdate(instance: any, data: any) {
  try {
    const qrCode = data.qrcode?.base64 || data.base64 || data.code;
    
    if (qrCode) {
      await supabase
        .from('whatsapp_instances')
        .update({
          qr_code: qrCode,
          status: 'generating',
          updated_at: new Date().toISOString(),
        })
        .eq('id', instance.id);

      console.log(`📱 QR Code updated for instance ${instance.id}`);
    }
  } catch (error) {
    console.error('❌ handleEvolutionQRUpdate error:', error);
  }
}

// =============================================
// META CLOUD API WEBHOOK HANDLER
// =============================================
async function handleMetaWebhook(body: any) {
  const entry = body.entry?.[0];
  if (!entry) return NextResponse.json({ status: 'ok' });

  const changes = entry.changes?.[0];
  if (!changes) return NextResponse.json({ status: 'ok' });

  const value = changes.value;
  const phoneNumberId = value.metadata?.phone_number_id;

  // Buscar config pelo phone_number_id
  let { data: config } = await supabase
    .from('whatsapp_accounts')
    .select('*, organization:organizations(*)')
    .eq('phone_number_id', phoneNumberId)
    .single();

  if (!config) {
    // Tentar tabela alternativa
    const { data: altConfig } = await supabase
      .from('whatsapp_configs')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .single();
    
    if (!altConfig) {
      console.log('⚠️ Config not found for:', phoneNumberId);
      return NextResponse.json({ status: 'ok' });
    }
    
    // Usar altConfig se config não foi encontrado
    config = altConfig;
  }

  const orgId = config?.organization_id;

  // Processar mensagens
  if (value.messages) {
    for (const message of value.messages) {
      await processMetaIncomingMessage(orgId, config, message, value.contacts?.[0]);
    }
  }

  // Processar status de entrega
  if (value.statuses) {
    for (const status of value.statuses) {
      await processMessageStatus(status);
    }
  }

  return NextResponse.json({ status: 'ok' });
}

async function processMetaIncomingMessage(orgId: string, config: any, message: any, contact: any) {
  // Implementação similar ao Evolution, mas para Meta Cloud API
  console.log('📨 Processing Meta message:', message);
  // TODO: Implementar se necessário
}

async function processMessageStatus(status: any) {
  const waMessageId = status.id;
  const statusValue = status.status;

  await supabase
    .from('whatsapp_messages')
    .update({ status: statusValue })
    .eq('wa_message_id', waMessageId);

  console.log(`📊 Status: ${waMessageId} -> ${statusValue}`);
}
