/**
 * Cloud sender — entrega humanizada (versão SIMPLES, Fase 2a / P1.6).
 *
 * 1 bolha apenas (split/typing/debounce ficam para a Fase 2d).
 * - Checa a janela de 24h: fechada => NÃO envia, loga e aborta (template
 *   livre fora de escopo nesta fase).
 * - Envia via createWhatsAppCloudClient (mesmo cliente do envio manual).
 * - Persiste o outbound em whatsapp_cloud_messages com
 *   direction='outbound', sent_by_bot=true, sender='ai', ai_agent_id.
 * - Atualiza last_message_* na conversa.
 *
 * Espelha EXATAMENTE o padrão de envio+persistência de
 * src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:122-163.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';
import { getAccessToken } from '@/lib/whatsapp/account-loader';

export interface SendHumanizedReplyParams {
  account: any;
  conversation: any;
  text: string;
  agent: { id: string; [key: string]: any };
  inboundMessageId?: string;
}

export interface SendHumanizedReplyResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
  error?: string;
}

export async function sendHumanizedReply(
  params: SendHumanizedReplyParams,
): Promise<SendHumanizedReplyResult> {
  const { account, conversation, text, agent } = params;

  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { sent: false, reason: 'empty_text' };
  }

  // --- Janela de 24h (checagem proativa) ---
  const windowExpired =
    conversation.is_window_open === false ||
    (conversation.window_expires_at &&
      new Date(conversation.window_expires_at).getTime() < Date.now());

  if (windowExpired) {
    console.warn(
      `[cloud-sender] janela 24h fechada — resposta NÃO enviada. conversation_id=${conversation.id}`,
    );
    return { sent: false, reason: 'window_closed' };
  }

  const phone = conversation.contact_phone || conversation.wa_id;
  if (!phone) {
    console.error(
      `[cloud-sender] sem telefone na conversa. conversation_id=${conversation.id}`,
    );
    return { sent: false, reason: 'no_phone' };
  }

  // --- Envio via Meta ---
  let result;
  try {
    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken: getAccessToken(account),
    });
    result = await client.sendText(phone, trimmed);
  } catch (apiError: any) {
    console.error('[cloud-sender] Cloud API error:', apiError?.message || apiError);
    return { sent: false, error: apiError?.message || 'send_failed' };
  }

  const messageId = result.messages?.[0]?.id;
  const nowIso = new Date().toISOString();

  // --- Persistência do outbound (espelha messages/route.ts:139-155) ---
  await supabaseAdmin
    .from('whatsapp_cloud_messages')
    .upsert(
      {
        organization_id: conversation.organization_id,
        store_id: conversation.store_id || account.store_id || null,
        waba_id: account.id,
        conversation_id: conversation.id,
        message_id: messageId,
        direction: 'outbound',
        from_number: account.phone_number,
        to_number: phone,
        message_type: 'text',
        content: { text: { body: trimmed } },
        text_body: trimmed,
        status: 'sent',
        sent_by_bot: true,
        sender: 'ai',
        ai_agent_id: agent.id,
        timestamp: nowIso,
      },
      { onConflict: 'message_id' },
    );

  await supabaseAdmin
    .from('whatsapp_cloud_conversations')
    .update({
      last_message_at: nowIso,
      last_message_preview: trimmed.substring(0, 100),
      last_message_direction: 'outbound',
    })
    .eq('id', conversation.id);

  return { sent: true, messageId };
}
