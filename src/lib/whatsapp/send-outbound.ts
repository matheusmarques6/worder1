// =============================================
// Sender unificado — escolhe entre Meta Cloud API e Evolution API
// baseado nas credenciais disponíveis para a conversa.
//
// Resolution order:
//   1. Se a conversa tem whatsapp_account_id e whatsapp_accounts.access_token
//      → envia via WhatsAppCloudAPI.
//   2. Senão se a conversa tem instance_id e whatsapp_instances.unique_id
//      → envia via Evolution sendWhatsAppMessage.
//   3. Senão retorna { ok: false, reason: 'no_sender_configured' }.
//
// Usado pelo worker /api/workers/ai-respond e por qualquer outro caller
// que precise enviar mensagem outbound do agente.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { WhatsAppCloudAPI } from '@/lib/whatsapp/cloud-api'
import { sendWhatsAppMessage as sendViaEvolution } from '@/lib/whatsapp/send-message'

export interface OutboundContext {
  organizationId: string
  conversationId: string
  whatsappAccountId: string | null
  instanceId: string | null
  phoneNumber: string
}

export interface OutboundResult {
  ok: boolean
  channel?: 'cloud' | 'evolution'
  waMessageId?: string | null
  reason?: string
  error?: string
}

export async function sendOutboundText(
  ctx: OutboundContext,
  text: string,
): Promise<OutboundResult> {
  const supabase = getSupabaseAdmin()

  // 1) Cloud API
  if (ctx.whatsappAccountId) {
    const { data: account } = await supabase
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token, is_active')
      .eq('id', ctx.whatsappAccountId)
      .maybeSingle()
    if (account?.is_active && account.phone_number_id && account.access_token) {
      try {
        const api = new WhatsAppCloudAPI({
          phoneNumberId: account.phone_number_id as string,
          accessToken: account.access_token as string,
        })
        const sendResult = await api.sendText(ctx.phoneNumber, text)
        return {
          ok: true,
          channel: 'cloud',
          waMessageId: sendResult.messages?.[0]?.id ?? null,
        }
      } catch (err) {
        return {
          ok: false,
          channel: 'cloud',
          reason: 'cloud_send_failed',
          error: err instanceof Error ? err.message : 'unknown',
        }
      }
    }
  }

  // 1.b) Cloud API alternativo: whatsapp_business_accounts (schema do
  // webhook /api/whatsapp/cloud/webhook).
  if (!ctx.whatsappAccountId) {
    const { data: waba } = await supabase
      .from('whatsapp_business_accounts')
      .select('id, phone_number_id, access_token, status')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (waba?.phone_number_id && waba.access_token) {
      try {
        const api = new WhatsAppCloudAPI({
          phoneNumberId: waba.phone_number_id as string,
          accessToken: waba.access_token as string,
        })
        const sendResult = await api.sendText(ctx.phoneNumber, text)
        return {
          ok: true,
          channel: 'cloud',
          waMessageId: sendResult.messages?.[0]?.id ?? null,
        }
      } catch {
        // cai pro Evolution
      }
    }
  }

  // 2) Evolution API
  if (ctx.instanceId) {
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('unique_id, is_active')
      .eq('id', ctx.instanceId)
      .maybeSingle()
    if (instance?.is_active && instance.unique_id) {
      const result = await sendViaEvolution({
        instanceName: instance.unique_id as string,
        phone: ctx.phoneNumber,
        message: text,
      })
      if (result.success) {
        return {
          ok: true,
          channel: 'evolution',
          waMessageId: result.messageId ?? null,
        }
      }
      return {
        ok: false,
        channel: 'evolution',
        reason: 'evolution_send_failed',
        error: result.error,
      }
    }
  }

  return { ok: false, reason: 'no_sender_configured' }
}
