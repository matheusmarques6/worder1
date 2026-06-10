// =============================================
// P0 — Propagação de status de webhook pra whatsapp_campaign_recipients.
// Toda a lógica (lookup por meta_message_id, guard anti-retrógrado e
// incremento de contadores da campanha por delta) vive no RPC
// apply_campaign_recipient_webhook (migration 20260615) em UMA transação
// com FOR UPDATE — imune à corrida delivered/read entre workers QStash.
// Chamado de processStatus (webhook-processor) como best-effort: a
// atualização de whatsapp_cloud_messages nunca é bloqueada por isto.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'

const CAMPAIGN_STATUSES = new Set(['sent', 'delivered', 'read', 'failed'])

export async function applyCampaignRecipientWebhookStatus(
  metaMessageId: string,
  newStatus: string,
  opts: { errorCode?: string; errorMessage?: string } = {},
): Promise<boolean> {
  if (!metaMessageId || !CAMPAIGN_STATUSES.has(newStatus)) return false

  const { data, error } = await supabaseAdmin.rpc('apply_campaign_recipient_webhook', {
    p_meta_message_id: metaMessageId,
    p_new_status: newStatus,
    p_error_code: opts.errorCode ?? null,
    p_error_message: opts.errorMessage ?? null,
    p_timestamp: new Date().toISOString(),
  })

  if (error) {
    // Best-effort: loga e segue — o status em whatsapp_cloud_messages já foi
    // persistido pelo caller; recipient fica eventualmente consistente via
    // checkCampaignCompletion (recompute absoluto no fim da campanha).
    wlog.error('whatsapp.campaign.recipient_webhook_rpc_error', {
      meta_message_id: metaMessageId,
      new_status: newStatus,
      error: error.message,
    })
    return false
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return false // mensagem não pertence a campanha — caminho comum

  if (row.applied === false) {
    wlog.info('whatsapp.campaign.recipient_retrograde_skipped', {
      meta_message_id: metaMessageId,
      to: newStatus,
    })
  }
  return row.applied === true
}
