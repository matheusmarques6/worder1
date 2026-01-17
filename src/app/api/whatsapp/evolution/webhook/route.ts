// =============================================
// API: Evolution - Webhook
// src/app/api/whatsapp/evolution/webhook/route.ts
// CORRIGIDO para schema v2
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// =============================================
// POST - Receber eventos
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Extrair dados do evento
    const eventType = body.event;
    const instanceName = body.instance || body.sender?.split('@')[0];
    
    console.log('[Evolution Webhook] Event:', eventType, '| Instance:', instanceName);
    console.log('[Evolution Webhook] Full body:', JSON.stringify(body).substring(0, 500));

    // Buscar instância na tabela whatsapp_instances
    // IMPORTANTE: Buscar por unique_id (usado na Evolution API), instance_name ou instance_id
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .or(`unique_id.eq.${instanceName},instance_name.eq.${instanceName}`)
      .single();
    
    console.log('[Evolution Webhook] Instance lookup:', { instanceName, found: !!instance, error: instanceError?.message });

    if (instanceError || !instance) {
      // Tentar buscar por qualquer instância conectada (fallback)
      console.warn('[Evolution Webhook] Instance not found by unique_id/instance_name:', instanceName);
      console.warn('[Evolution Webhook] Trying fallback: looking for any connected instance...');
      
      const { data: anyInstance, error: fallbackError } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('status', 'connected')
        .limit(1)
        .single();
      
      if (!anyInstance) {
        console.error('[Evolution Webhook] ❌ No connected instance found!');
        console.error('[Evolution Webhook] Fallback error:', fallbackError?.message);
        console.error('[Evolution Webhook] Available instance names should match Evolution API instance names');
        return NextResponse.json({ 
          received: true, 
          error: 'No instance found',
          searched_for: instanceName,
          hint: 'Verifique se o unique_id no banco corresponde ao instance_name na Evolution API'
        });
      }
      
      console.log('[Evolution Webhook] ✅ Fallback: Using instance:', anyInstance.unique_id || anyInstance.instance_name);
      // Usar a instância encontrada
      await processEvent(anyInstance, body, eventType);
    } else {
      console.log('[Evolution Webhook] ✅ Instance found:', instance.unique_id || instance.instance_name);
      await processEvent(instance, body, eventType);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Evolution Webhook] Error:', error);
    return NextResponse.json({ received: true, error: String(error) });
  }
}

// =============================================
// PROCESSAR EVENTO
// =============================================
async function processEvent(instance: any, body: any, eventType: string) {
  // QR Code
  if (eventType === 'qrcode.updated' || eventType === 'qr') {
    await handleQRCode(instance, body);
  }
  // Conexão
  else if (eventType === 'connection.update' || eventType === 'status' || eventType === 'connection') {
    await handleConnection(instance, body);
  }
  // Mensagem recebida
  else if (eventType === 'messages.upsert' || eventType === 'message' || eventType === 'messages') {
    await handleMessage(instance, body);
  }
  // Status de mensagem enviada
  else if (eventType === 'messages.update' || eventType === 'message.ack') {
    await handleMessageStatus(instance, body);
  }

  // Atualizar última atividade
  await supabase
    .from('whatsapp_instances')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', instance.id);
}

// =============================================
// QR CODE
// =============================================
async function handleQRCode(instance: any, body: any) {
  const qrcode = body.qrcode?.base64 || body.data?.qrcode?.base64 || body.base64;
  
  if (qrcode) {
    console.log('[Evolution] QR Code received');
    await supabase
      .from('whatsapp_instances')
      .update({
        qr_code: qrcode,
        status: 'qr_pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id);
  }
}

// =============================================
// CONNECTION
// =============================================
async function handleConnection(instance: any, body: any) {
  const state = body.state || body.data?.state || body.data?.instance?.state;
  
  console.log('[Evolution] Connection state:', state);
  
  if (state === 'open' || state === 'connected') {
    const phoneNumber = body.data?.instance?.phoneNumber || 
                       body.data?.instance?.wuid?.split('@')[0] ||
                       body.phoneNumber;
    
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'connected',
        phone_number: phoneNumber,
        qr_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id);
      
    console.log('[Evolution] Connected:', phoneNumber);
  } else if (state === 'close' || state === 'disconnected') {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id);
  } else if (state === 'connecting') {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'connecting',
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id);
  }
}

// =============================================
// MESSAGE
// =============================================
async function handleMessage(instance: any, body: any) {
  try {
    console.log('[Evolution] ========== PROCESSING MESSAGE ==========');
    console.log('[Evolution] Instance:', instance.id, '| Org:', instance.organization_id);
    
    // Extrair dados da mensagem (diferentes formatos do Evolution)
    const data = body.data || body;
    const key = data.key || data.message?.key;
    const message = data.message?.message || data.message;
    const pushName = data.pushName || data.message?.pushName || 'Desconhecido';

    console.log('[Evolution] Raw key:', JSON.stringify(key).substring(0, 200));

    // Ignorar mensagens próprias
    if (key?.fromMe) {
      console.log('[Evolution] Skipping own message');
      return;
    }

    // Extrair remoteJid
    const remoteJid = key?.remoteJid || data.remoteJid;
    if (!remoteJid) {
      console.error('[Evolution] No remoteJid found');
      return;
    }

    // Ignorar grupos
    if (remoteJid.includes('@g.us')) {
      console.log('[Evolution] Skipping group message');
      return;
    }

    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
    const chatId = remoteJid;
    const contactName = pushName || phoneNumber;

    // Extrair conteúdo
    let content = message?.conversation ||
                  message?.extendedTextMessage?.text ||
                  message?.imageMessage?.caption ||
                  message?.videoMessage?.caption ||
                  '';

    // Determinar tipo de mídia
    let messageType = 'text';
    let mediaUrl = null;
    let mediaMimeType = null;
    let mediaBase64 = null;

    if (message?.imageMessage) {
      messageType = 'image';
      content = content || '';
      mediaUrl = message.imageMessage.url;
      mediaMimeType = message.imageMessage.mimetype || 'image/jpeg';
      mediaBase64 = message.imageMessage.base64 || body.data?.base64 || body.base64;
    }
    if (message?.audioMessage) {
      messageType = 'audio';
      content = '';
      mediaUrl = message.audioMessage.url;
      mediaMimeType = message.audioMessage.mimetype || 'audio/ogg';
      mediaBase64 = message.audioMessage.base64 || body.data?.base64 || body.base64;
    }
    if (message?.videoMessage) {
      messageType = 'video';
      content = content || '';
      mediaUrl = message.videoMessage.url;
      mediaMimeType = message.videoMessage.mimetype || 'video/mp4';
      mediaBase64 = message.videoMessage.base64 || body.data?.base64 || body.base64;
    }
    if (message?.documentMessage) {
      messageType = 'document';
      content = message.documentMessage.fileName || '';
      mediaUrl = message.documentMessage.url;
      mediaMimeType = message.documentMessage.mimetype || 'application/pdf';
      mediaBase64 = message.documentMessage.base64 || body.data?.base64 || body.base64;
    }
    if (message?.stickerMessage) {
      messageType = 'sticker';
      content = '';
      mediaBase64 = message.stickerMessage.base64 || body.data?.base64 || body.base64;
      mediaMimeType = 'image/webp';
    }
    if (message?.locationMessage) {
      messageType = 'location';
      content = `📍 ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}`;
    }
    if (message?.contactMessage) {
      messageType = 'contact';
      content = `👤 ${message.contactMessage.displayName}`;
    }

    console.log('[Evolution] Message from:', phoneNumber, '| Type:', messageType, '| HasBase64:', !!mediaBase64);

    // Se tem mídia mas não tem base64, tentar baixar da Evolution API
    if (messageType !== 'text' && !mediaBase64 && mediaUrl) {
      try {
        console.log('[Evolution] Fetching media base64 from Evolution API...');
        const mediaResponse = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instance.unique_id || instance.instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            message: {
              key: key
            },
            convertToMp4: messageType === 'audio' ? false : undefined,
          }),
        });

        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json();
          if (mediaData.base64) {
            mediaBase64 = mediaData.base64;
            console.log('[Evolution] ✅ Got media base64, length:', mediaBase64.length);
          }
        }
      } catch (mediaError) {
        console.error('[Evolution] Error fetching media:', mediaError);
      }
    }

    // Se tem base64, fazer upload para Supabase Storage
    let permanentMediaUrl = null;
    if (mediaBase64) {
      try {
        const ext = mediaMimeType?.split('/')[1]?.split(';')[0] || 'bin';
        const fileName = `${instance.organization_id}/${Date.now()}-${messageId.substring(0, 8)}.${ext}`;
        
        // Converter base64 para buffer
        const buffer = Buffer.from(mediaBase64, 'base64');
        
        // Upload para Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('whatsapp-media')
          .upload(fileName, buffer, {
            contentType: mediaMimeType || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) {
          console.error('[Evolution] Storage upload error:', uploadError);
        } else {
          // Gerar URL pública
          const { data: publicUrlData } = supabase.storage
            .from('whatsapp-media')
            .getPublicUrl(fileName);
          
          permanentMediaUrl = publicUrlData?.publicUrl;
          console.log('[Evolution] ✅ Media uploaded:', permanentMediaUrl?.substring(0, 80));
        }
      } catch (storageError) {
        console.error('[Evolution] Storage error:', storageError);
      }
    }

    // Usar URL permanente se disponível, senão a original
    const finalMediaUrl = permanentMediaUrl || mediaUrl;

    // 1. Buscar ou criar conversa
    let { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('organization_id', instance.organization_id)
      .eq('chat_id', chatId)
      .single();

    if (!conversation) {
      console.log('[Evolution] Creating new conversation for:', phoneNumber);
      
      const { data: newConv, error: convError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          organization_id: instance.organization_id,
          instance_id: instance.id,
          chat_id: chatId,
          contact_phone: phoneNumber,
          contact_name: contactName,
          status: 'open',
          last_message_at: new Date().toISOString(),
          last_message_preview: content?.substring(0, 100) || '[Mídia]',
          last_message_direction: 'inbound',
          unread_count: 1,
        })
        .select()
        .single();

      if (convError) {
        console.error('[Evolution] Error creating conversation:', convError);
        return;
      }
      conversation = newConv;
      console.log('[Evolution] Conversation created:', conversation.id);
    } else {
      // Atualizar conversa existente
      await supabase
        .from('whatsapp_conversations')
        .update({
          status: 'open',
          contact_name: contactName,
          last_message_at: new Date().toISOString(),
          last_message_preview: content?.substring(0, 100) || '[Mídia]',
          last_message_direction: 'inbound',
          last_customer_message_at: new Date().toISOString(),
          unread_count: (conversation.unread_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);
    }

    // 2. Verificar duplicata
    const messageId = key?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const { data: existingMsg } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('message_id', messageId)
      .single();

    if (existingMsg) {
      console.log('[Evolution] Duplicate message, skipping:', messageId);
      return;
    }

    // 3. Salvar mensagem
    const { data: savedMessage, error: msgError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: instance.organization_id,
        instance_id: instance.id,
        conversation_id: conversation.id,
        message_id: messageId,
        direction: 'inbound',
        message_type: messageType,
        content: content || '',
        status: 'received',
        media_url: finalMediaUrl,
        media_mime_type: mediaMimeType,
        metadata: {
          pushName,
          remoteJid,
          participant: key?.participant,
          originalMediaUrl: mediaUrl,
        },
      })
      .select()
      .single();

    if (msgError) {
      console.error('[Evolution] Error saving message:', msgError);
      return;
    }

    console.log('[Evolution] ✅ Message saved:', savedMessage.id, '| Conversation:', conversation.id);

  } catch (error) {
    console.error('[Evolution] Error processing message:', error);
  }
}

// =============================================
// MESSAGE STATUS UPDATE
// =============================================
async function handleMessageStatus(instance: any, body: any) {
  try {
    const data = body.data || body;
    const messageId = data.key?.id || data.id;
    const status = data.status || data.update?.status;

    if (!messageId || !status) return;

    // Mapear status
    const statusMap: Record<string, string> = {
      'DELIVERY_ACK': 'delivered',
      'READ': 'read',
      'PLAYED': 'read',
      'PENDING': 'sent',
      'SERVER_ACK': 'sent',
      '1': 'sent',
      '2': 'delivered',
      '3': 'read',
      '4': 'read',
    };

    const mappedStatus = statusMap[status] || status;

    await supabase
      .from('whatsapp_messages')
      .update({ 
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('message_id', messageId);

    console.log('[Evolution] Message status updated:', messageId, '->', mappedStatus);
  } catch (error) {
    console.error('[Evolution] Error updating message status:', error);
  }
}

// =============================================
// GET - Status check
// =============================================
export async function GET() {
  return NextResponse.json({ 
    status: 'Evolution Webhook active',
    timestamp: new Date().toISOString(),
    version: 'v2-fixed'
  });
}
