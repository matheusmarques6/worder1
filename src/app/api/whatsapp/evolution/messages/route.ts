// =============================================
// API: Evolution - Messages
// src/app/api/whatsapp/evolution/messages/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createEvolutionClient } from '@/lib/whatsapp/evolution-api';

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
      instanceId,
      to,
      type = 'text',
      content,
      // Para mídia
      mediaUrl,
      caption,
      filename,
      // Para botões
      title,
      description,
      buttons,
      // Para lista
      buttonText,
      sections,
      // Para localização
      latitude,
      longitude,
      locationName,
      address,
    } = body;

    if (!instanceId || !to) {
      return NextResponse.json({ 
        error: 'Missing required fields: instanceId, to' 
      }, { status: 400 });
    }

    // Buscar instância
    const { data: instance } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('id', instanceId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    if (instance.status !== 'connected') {
      return NextResponse.json({ 
        error: 'Instance not connected',
        code: 'NOT_CONNECTED'
      }, { status: 400 });
    }

    // Criar cliente
    const client = createEvolutionClient({
      serverUrl: instance.server_url,
      apiKey: instance.api_key,
      instanceName: instance.instance_name,
    });

    let result;
    let messageContent: any = {};
    let textBody = '';

    try {
      switch (type) {
        case 'text':
          if (!content) {
            return NextResponse.json({ error: 'content required for text' }, { status: 400 });
          }
          result = await client.sendText(to, content);
          messageContent = { text: content };
          textBody = content;
          break;

        case 'image':
          if (!mediaUrl) {
            return NextResponse.json({ error: 'mediaUrl required for image' }, { status: 400 });
          }
          result = await client.sendMedia(to, 'image', mediaUrl, { caption });
          messageContent = { image: { url: mediaUrl, caption } };
          textBody = caption || '[Imagem]';
          break;

        case 'video':
          if (!mediaUrl) {
            return NextResponse.json({ error: 'mediaUrl required for video' }, { status: 400 });
          }
          result = await client.sendMedia(to, 'video', mediaUrl, { caption });
          messageContent = { video: { url: mediaUrl, caption } };
          textBody = caption || '[Vídeo]';
          break;

        case 'audio':
          if (!mediaUrl) {
            return NextResponse.json({ error: 'mediaUrl required for audio' }, { status: 400 });
          }
          result = await client.sendMedia(to, 'audio', mediaUrl);
          messageContent = { audio: { url: mediaUrl } };
          textBody = '[Áudio]';
          break;

        case 'document':
          if (!mediaUrl) {
            return NextResponse.json({ error: 'mediaUrl required for document' }, { status: 400 });
          }
          result = await client.sendMedia(to, 'document', mediaUrl, { caption, fileName: filename });
          messageContent = { document: { url: mediaUrl, filename, caption } };
          textBody = caption || `[Documento: ${filename}]`;
          break;

        case 'buttons':
          if (!title || !description || !buttons) {
            return NextResponse.json({ error: 'title, description and buttons required' }, { status: 400 });
          }
          result = await client.sendButtons(to, title, description, buttons);
          messageContent = { buttons: { title, description, buttons } };
          textBody = description;
          break;

        case 'list':
          if (!title || !description || !buttonText || !sections) {
            return NextResponse.json({ error: 'title, description, buttonText and sections required' }, { status: 400 });
          }
          result = await client.sendList(to, title, description, buttonText, sections);
          messageContent = { list: { title, description, buttonText, sections } };
          textBody = description;
          break;

        case 'location':
          if (!latitude || !longitude) {
            return NextResponse.json({ error: 'latitude and longitude required' }, { status: 400 });
          }
          result = await client.sendLocation(to, latitude, longitude, { name: locationName, address });
          messageContent = { location: { latitude, longitude, name: locationName, address } };
          textBody = `[Localização: ${locationName || address || `${latitude},${longitude}`}]`;
          break;

        default:
          return NextResponse.json({ error: 'Invalid message type' }, { status: 400 });
      }
    } catch (apiError: any) {
      console.error('Evolution API error:', apiError);
      return NextResponse.json({ 
        error: apiError.message || 'Failed to send message' 
      }, { status: 400 });
    }

    // Normalizar telefone
    let normalizedTo = to.replace(/\D/g, '');
    if (normalizedTo.startsWith('0')) normalizedTo = normalizedTo.substring(1);
    if (normalizedTo.length === 10 || normalizedTo.length === 11) normalizedTo = '55' + normalizedTo;

    // Buscar ou criar conversa
    let { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('phone_number', normalizedTo)
      .single();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('whatsapp_conversations')
        .insert({
          organization_id: profile.organization_id,
          phone_number: normalizedTo,
          status: 'open',
        })
        .select('id')
        .single();
      conversation = newConv;
    }

    // Salvar mensagem
    const messageId = result?.key?.id || `out-${Date.now()}`;
    
    const { data: savedMessage } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: profile.organization_id,
        conversation_id: conversation?.id,
        wamid: messageId,
        wa_message_id: messageId,
        direction: 'outbound',
        message_type: type,
        content: textBody,
        metadata: messageContent,
        status: 'sent',
      })
      .select()
      .single();

    // Atualizar conversa
    if (conversation?.id) {
      await supabase
        .from('whatsapp_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: textBody.substring(0, 100),
        })
        .eq('id', conversation.id);
    }

    // Atualizar contadores
    await supabase
      .from('evolution_instances')
      .update({
        messages_sent_today: instance.messages_sent_today + 1,
        total_messages_sent: instance.total_messages_sent + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', instance.id);

    return NextResponse.json({
      success: true,
      messageId,
      message: savedMessage,
      result,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
