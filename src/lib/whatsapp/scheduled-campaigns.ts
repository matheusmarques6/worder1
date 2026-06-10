// =============================================
// P0 — Disparo de campanhas WhatsApp agendadas.
// Claim atômico via RPC claim_due_whatsapp_campaigns (FOR UPDATE SKIP
// LOCKED, scheduled -> queued). O cron roda a cada minuto; o claim
// garante que duas execuções nunca disparam a mesma campanha 2x.
// Campanhas com scheduled_at > 48h no passado (estado pré-deploy deste
// cron) são CANCELADAS em vez de enviadas — marketing atrasado dias é
// pior que não enviar.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'

export const STALE_CAMPAIGN_MS = 48 * 60 * 60 * 1000

export interface DispatchDeps {
  startCampaign: (campaignId: string) => Promise<{ success: boolean; error?: string; totalRecipients?: number }>
}

export interface DispatchResult {
  dispatched: number
  expired: number
  failed: number
  results: Array<{ id: string; outcome: 'started' | 'expired' | 'failed'; error?: string }>
}

export async function processDueWhatsappCampaigns(deps: DispatchDeps): Promise<DispatchResult> {
  const { data: due, error } = await supabaseAdmin.rpc('claim_due_whatsapp_campaigns', { p_limit: 3 })
  if (error) throw new Error(`claim_due_whatsapp_campaigns failed: ${error.message}`)

  const result: DispatchResult = { dispatched: 0, expired: 0, failed: 0, results: [] }
  if (!due || due.length === 0) return result

  const cutoff = Date.now() - STALE_CAMPAIGN_MS

  for (const camp of due) {
    if (camp.scheduled_at && new Date(camp.scheduled_at).getTime() < cutoff) {
      const { error: cancelErr } = await supabaseAdmin
        .from('whatsapp_campaigns')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', camp.id)
      if (cancelErr) {
        wlog.error('whatsapp.campaign.cancel_update_failed', {
          campaign_id: camp.id,
          error: cancelErr.message,
        })
      }
      const { error: logErr } = await supabaseAdmin.from('whatsapp_campaign_logs').insert({
        campaign_id: camp.id,
        log_type: 'warning',
        message: `Campanha expirada: agendada para ${camp.scheduled_at}, mais de 48h no passado. Cancelada automaticamente.`,
      })
      if (logErr) {
        wlog.error('whatsapp.campaign.log_insert_failed', {
          campaign_id: camp.id,
          error: logErr.message,
        })
      }
      wlog.warn('whatsapp.campaign.scheduled_expired', {
        campaign_id: camp.id,
        organization_id: camp.organization_id,
        scheduled_at: camp.scheduled_at,
      })
      result.expired++
      result.results.push({ id: camp.id, outcome: 'expired' })
      continue
    }

    try {
      const start = await deps.startCampaign(camp.id)
      if (start.success) {
        result.dispatched++
        result.results.push({ id: camp.id, outcome: 'started' })
        wlog.info('whatsapp.campaign.scheduled_dispatched', {
          campaign_id: camp.id,
          organization_id: camp.organization_id,
          total_recipients: start.totalRecipients,
        })
      } else {
        // startCampaign já tratou (failed permanente OU revert pra scheduled
        // no caso de template pendente) e logou.
        result.failed++
        result.results.push({ id: camp.id, outcome: 'failed', error: start.error })
      }
    } catch (err: any) {
      result.failed++
      result.results.push({ id: camp.id, outcome: 'failed', error: err?.message })
      wlog.error('whatsapp.campaign.scheduled_dispatch_error', {
        campaign_id: camp.id,
        error: err?.message,
      })
    }
  }

  return result
}
