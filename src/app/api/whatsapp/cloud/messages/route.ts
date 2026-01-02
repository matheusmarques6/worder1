// =============================================
// API: WhatsApp Cloud - Messages
// src/app/api/whatsapp/cloud/messages/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient, normalizePhone } from '@/lib/whatsapp/cloud-api';

// =============================================
// GET - Listar mensagens de uma conversa
// =============================================
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    const { data: messages, error } = await supabase
      .from('whatsapp_cloud_messages')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ 
      messages: (messages || []).reverse(),
      pagination: { limit, offset, hasMore: messages?.length === limit }
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// POST - Enviar mensagem
// =============================================
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const { 
      accountId,
      to,
      type = 'text',
      content,
      // Para templates
      templateName,
      templateLanguage = 'pt_BR',
      templateComponents,
      // Para mídia
      mediaUrl,
      mediaId,
      caption,
      filename,
      // Para interativos
      buttons,
      listSections,
      buttonText,
      header,
      footer,
    } = body;

    // Validar campos obrigatórios
    if (!accountId || !to) {
      return NextResponse.json({ 
        error: 'Missing required fields: accountId, to' 
      }, { status: 400 });
    }

    // Buscar conta
    const { data: account } = await supabase
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', profile.organization_id)
      .eq('status', 'active')
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found or inactive' }, { status: 404 });
    }

    // Verificar janela de 24h (exceto para templates)
    if (type !== 'template') {
      const { data: conversation } = await supabase
        .from('whatsapp_cloud_conversations')
        .select('is_window_open, window_expires_at')
        .eq('waba_id', account.id)
        .eq('wa_id', normalizePhone(to))
        .single();

      if (conversation) {
        const windowExpired = conversation.window_expires_at && 
          new Date(conversation.window_expires_at) < new Date();
        
        if (!conversation.is_window_open || windowExpired) {
          return NextResponse.json({ 
            error: 'Conversation window expired. Use a template message to initiate conversation.',
            code: 'WINDOW_EXPIRED'
          }, { status: 400 });
        }
      } else if (type !== 'template') {
        // Não existe conversa e não é template
        return NextResponse.json({ 
          error: 'No active conversation. Use a template message to initiate.',
          code: 'NO_CONVERSATION'
        }, { status: 400 });
      }
    }

    // Criar cliente
    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken: account.access_token,
      wabaId: account.waba_id,
    });

    let result;
    let messageContent: any = {};
    let textBody = '';

    try {
      switch (type) {
        case 'text':
          if (!content) {
            return NextResponse.json({ error: 'content required for text message' }, { status: 400 });
          }
          result = await client.sendText(to, content);
          messageContent = { text: { body: content } };
          textBody = content;
          break;

        case 'image':
          result = await client.sendImage(to, { link: mediaUrl, id: mediaId }, caption);
          messageContent = { image: { link: mediaUrl, id: mediaId, caption } };
          textBody = caption || '[Imagem]';
          break;

        case 'video':
          result = await client.sendVideo(to, { link: mediaUrl, id: mediaId }, caption);
          messageContent = { video: { link: mediaUrl, id: mediaId, caption } };
          textBody = caption || '[Vídeo]';
          break;

        case 'audio':
          result = await client.sendAudio(to, { link: mediaUrl, id: mediaId });
          messageContent = { audio: { link: mediaUrl, id: mediaId } };
          textBody = '[Áudio]';
          break;

        case 'document':
          result = await client.sendDocument(to, { link: mediaUrl, id: mediaId, filename }, caption);
          messageContent = { document: { link: mediaUrl, id: mediaId, filename, caption } };
          textBody = caption || `[Documento: ${filename}]`;
          break;

        case 'template':
          if (!templateName) {
            return NextResponse.json({ error: 'templateName required' }, { status: 400 });
          }
          result = await client.sendTemplate(to, templateName, templateLanguage, templateComponents);
          messageContent = { 
            template: { 
              name: templateName, 
              language: templateLanguage, 
              components: templateComponents 
            } 
          };
          textBody = `[Template: ${templateName}]`;
          break;

        case 'buttons':
          if (!content || !buttons) {
            return NextResponse.json({ error: 'content and buttons required' }, { status: 400 });
          }
          result = await client.sendButtons(to, content, buttons, header, footer);
          messageContent = { interactive: { type: 'button', body: content, buttons } };
          textBody = content;
          break;

        case 'list':
          if (!content || !listSections || !buttonText) {
            return NextResponse.json({ error: 'content, listSections and buttonText required' }, { status: 400 });
          }
          result = await client.sendList(to, content, buttonText, listSections, header, footer);
          messageContent = { interactive: { type: 'list', body: content, sections: listSections } };
          textBody = content;
          break;

        case 'location':
          const { latitude, longitude, name, address } = content;
          result = await client.sendLocation(to, { latitude, longitude, name, address });
          messageContent = { location: content };
          textBody = `[Localização: ${name || address || `${latitude},${longitude}`}]`;
          break;

        default:
          return NextResponse.json({ error: 'Invalid message type' }, { status: 400 });
      }
    } catch (apiError: any) {
      console.error('WhatsApp API Error:', apiError);
      return NextResponse.json({ 
        error: apiError.message || 'Failed to send message',
        code: apiError.code,
        details: apiError.error_data
      }, { status: 400 });
    }

    const messageId = result.messages?.[0]?.id;
    const recipientWaId = result.contacts?.[0]?.wa_id || normalizePhone(to);

    // Buscar ou criar conversa
    let { data: conversation } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('id')
      .eq('waba_id', account.id)
      .eq('wa_id', recipientWaId)
      .single();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('whatsapp_cloud_conversations')
        .insert({
          organization_id: profile.organization_id,
          waba_id: account.id,
          wa_id: recipientWaId,
          chat_id: `${account.phone_number}-${recipientWaId}`,
          contact_phone: recipientWaId,
          status: 'open',
          is_window_open: type === 'template',
        })
        .select('id')
        .single();
      conversation = newConv;
    }

    // Salvar mensagem
    const { data: savedMessage } = await supabase
      .from('whatsapp_cloud_messages')
      .insert({
        organization_id: profile.organization_id,
        waba_id: account.id,
        conversation_id: conversation?.id,
        message_id: messageId,
        direction: 'outbound',
        from_number: account.phone_number,
        to_number: recipientWaId,
        message_type: type,
        content: messageContent,
        text_body: textBody,
        caption,
        template_name: templateName,
        status: 'sent',
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    // Atualizar conversa
    if (conversation?.id) {
      await supabase
        .from('whatsapp_cloud_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: textBody.substring(0, 100),
          last_message_direction: 'outbound',
        })
        .eq('id', conversation.id);
    }

    // Atualizar métricas
    await supabase
      .from('whatsapp_business_accounts')
      .update({
        messages_sent_today: account.messages_sent_today + 1,
        total_messages_sent: account.total_messages_sent + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', account.id);

    return NextResponse.json({
      success: true,
      messageId,
      message: savedMessage,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
