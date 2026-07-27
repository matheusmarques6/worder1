// =============================================
// API: WhatsApp Cloud - Messages
// src/app/api/whatsapp/cloud/messages/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient, normalizePhone } from '@/lib/whatsapp/cloud-api';
import { getAccessToken } from '@/lib/whatsapp/account-loader';
import {
  requireOptIn,
  readOverrideFromRequest,
  buildOptOutBlockedResponse,
  type TemplateCategory,
} from '@/lib/whatsapp/opt-out-guard';
import { wlog } from '@/lib/observability/whatsapp-logger';
import { sendAlert } from '@/lib/whatsapp/alerts';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  checkBeforeSend,
  reportSendResult,
  buildRateLimitedResponseBody,
} from '@/lib/whatsapp/send-guard';
export const dynamic = 'force-dynamic';

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
  } catch (error: any) {
    wlog.error('whatsapp.cloud.messages.list_error', { error: error?.message });
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

    // B11: rate limit per-org. 80 msg/s e o cap pratico de Meta tier 3+;
    // protege contra batch UI maluco e abusos por token comprometido.
    const rl = await checkRateLimit(
      `wa:cloud:messages:${profile.organization_id}`,
      { limit: 80, windowSec: 1 },
    );
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'rate_limited', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
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

    // Onda 10 — guard opt-out. Para templates, le categoria do BD pra
    // permitir bypass transacional (UTILITY/AUTHENTICATION).
    let tplCategory: TemplateCategory | undefined
    if (type === 'template' && templateName) {
      const { data: tpl } = await supabase
        .from('whatsapp_templates')
        .select('category')
        .eq('waba_id', account.id)
        .eq('name', templateName)
        .maybeSingle()
      if (tpl?.category) {
        const upper = (tpl.category as string).toUpperCase()
        if (upper === 'MARKETING' || upper === 'UTILITY' || upper === 'AUTHENTICATION') {
          tplCategory = upper
        }
      }
    }

    const optCheck = await requireOptIn(
      profile.organization_id,
      to,
      tplCategory,
      {
        ...(readOverrideFromRequest(request) || {}),
        sender: 'cloud.messages',
      },
    )
    if (!optCheck.allowed) {
      return NextResponse.json(
        buildOptOutBlockedResponse(optCheck, tplCategory),
        { status: 409 },
      )
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

    // Send guard — rate limiter por tier da Meta + circuit breaker
    // (mesma proteção do caminho de campanhas). O checkRateLimit de
    // 80/s acima continua como camada anti-abuso por org.
    const guardCheck = await checkBeforeSend({
      accountId: account.id,
      recipientPhone: to,
      messagingLimit: account.messaging_limit,
    });
    if (!guardCheck.allowed) {
      const body429 = buildRateLimitedResponseBody(guardCheck);
      return NextResponse.json(body429, {
        status: 429,
        headers: { 'Retry-After': String(body429.retryAfter) },
      });
    }

    // Criar cliente
    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken: getAccessToken(account),
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
      wlog.error('whatsapp.send.api_error', {
        code: apiError?.code,
        subcode: apiError?.error_subcode,
        message: apiError?.message,
        account_id: account.id,
        organization_id: profile.organization_id,
      });

      await reportSendResult({
        accountId: account.id,
        success: false,
        errorCode: apiError?.code,
        error: apiError,
        messagingLimit: account.messaging_limit,
      });

      if (apiError.code === 132015 || apiError.code === 132016) {
        const newStatus = apiError.code === 132015 ? 'PAUSED' : 'DISABLED';
        if (templateName) {
          await supabase
            .from('whatsapp_templates')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('waba_id', account.id)
            .eq('name', templateName);
        }
      }

      // C5: token invalido/expirado precisa virar surface (UI badge) +
      // alerta humano. sendAlert dedupa por (type, waba_id) — nao spamma.
      if ([190, 102, 200].includes(apiError.code)) {
        const nowIso = new Date().toISOString();
        await supabase
          .from('whatsapp_business_accounts')
          .update({
            status: 'auth_error',
            token_invalid_at: nowIso,
            token_invalid_code: apiError.code,
            token_invalid_message: apiError.message ?? null,
            updated_at: nowIso,
          })
          .eq('id', account.id);

        wlog.error('whatsapp.token.expired', {
          organization_id: profile.organization_id,
          account_id: account.id,
          phone_number_id: account.phone_number_id,
          code: apiError.code,
          subcode: apiError.error_subcode,
        });

        await sendAlert({
          severity: 'critical',
          type: 'account_restricted',
          title: 'WhatsApp token invalido/expirado',
          message: `Account ${account.verified_name || account.phone_number} parou de enviar — Meta code ${apiError.code}. Reconecte no painel.`,
          organizationId: profile.organization_id,
          wabaId: account.id,
          metadata: {
            code: apiError.code,
            subcode: apiError.error_subcode,
            phone_number_id: account.phone_number_id,
          },
        });
      }

      return NextResponse.json({
        error: apiError.message || 'Failed to send message',
        code: apiError.code,
        details: apiError.error_data
      }, { status: 400 });
    }

    await reportSendResult({ accountId: account.id, success: true });

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
          is_window_open: false,
          window_expires_at: null,
        })
        .select('id')
        .single();
      conversation = newConv;
    }

    const { data: savedMessage } = await supabase
      .from('whatsapp_cloud_messages')
      .upsert({
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
      }, { onConflict: 'message_id' })
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
  } catch (error: any) {
    wlog.error('whatsapp.cloud.messages.post_error', { error: error?.message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
