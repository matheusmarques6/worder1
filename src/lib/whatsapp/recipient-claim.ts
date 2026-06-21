// =============================================
// RECIPIENT CLAIM — Phase 0 / 0D
// Idempotência de envio: pre-mark otimista + re-read filtrado.
// =============================================
//
// A Meta Cloud API NÃO tem idempotency key, e em campaign-processor o write
// `status='sent'` acontece DEPOIS da chamada à Meta. Sob re-drive de batch
// (circuit-breaker abort, crash mid-send, retry de worker) isso causa
// double-send. Este módulo centraliza dois primitivos usados por TODO caminho
// de envio:
//
//   1. claimRecipientForSend(id): transição otimista pending|queued -> sending
//      (`.update(...).in('status',['pending','queued']).select('id').maybeSingle()`).
//      Se nenhuma linha volta, outro processo já tem o recipient — pule.
//
//   2. reReadClaimableRecipients(ids): re-lê recipients por ID filtrando a
//      status IN ('pending','queued'), para que nenhum batch confie num
//      snapshot estático e `increment_campaign_sent` seja uma soma corrente
//      correta entre re-drives.
//
// O sweep de quarentena (linhas 'sending' presas) vive no cron — ver
// quarantineStuckSending() e a wiring no reprocess-whatsapp-pending route.

import { supabaseAdmin } from '@/lib/supabase-admin'

/** Status considerados "ainda enviáveis" (re-read e claim). */
export const CLAIMABLE_STATUSES = ['pending', 'queued'] as const

/**
 * Pre-mark otimista de UM recipient: pending|queued -> sending.
 * Atômico no Postgres (UPDATE ... WHERE status IN (...) é uma única instrução).
 *
 * @returns true se ESTE chamador ganhou o claim (linha transicionada);
 *          false se a linha não estava mais claimable (já enviada/em voo por
 *          outro processo) — o chamador deve PULAR o envio.
 */
export async function claimRecipientForSend(recipientId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_campaign_recipients')
    .update({
      status: 'sending',
      sending_at: new Date().toISOString(),
    })
    .eq('id', recipientId)
    .in('status', CLAIMABLE_STATUSES as unknown as string[])
    .select('id')
    .maybeSingle()

  if (error) {
    // Em erro de claim, fail-CLOSED: NÃO envie (evita double-send sob falha).
    console.error(`[recipient-claim] claim failed for ${recipientId}:`, error.message)
    return false
  }

  return !!data
}

/**
 * Re-lê recipients por ID, filtrando a status IN ('pending','queued').
 * Qualquer (re)processamento de batch deve usar isto em vez de confiar no
 * array original do job — assim recipients já 'sent'/'failed'/'skipped'/'sending'
 * não são re-tocados num re-drive.
 *
 * @returns linhas claimable (subconjunto de ids), ou [] em erro.
 */
export async function reReadClaimableRecipients<
  T extends { id: string } = { id: string }
>(recipientIds: string[], columns = '*'): Promise<T[]> {
  if (recipientIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('whatsapp_campaign_recipients')
    .select(columns)
    .in('id', recipientIds)
    .in('status', CLAIMABLE_STATUSES as unknown as string[])

  if (error) {
    console.error('[recipient-claim] re-read failed:', error.message)
    return []
  }

  return (data as unknown as T[]) || []
}

/**
 * Sweep de quarentena: flipa linhas presas em 'sending' há mais de
 * `olderThanMs` (default 10min) para 'failed' com
 * error_message='ambiguous_send_quarantine'. Viés: um raro recipient
 * crashado-mid-send fica não-enviado-e-sinalizado em vez de arriscar duplicata
 * — o viés correto para envios de marketing.
 *
 * Idempotente e seguro para rodar em cron. Não toca linhas já terminais.
 *
 * @returns número de linhas quarentenadas (0 em erro).
 */
export async function quarantineStuckSending(
  olderThanMs: number = 10 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()

  const { data, error } = await supabaseAdmin
    .from('whatsapp_campaign_recipients')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: 'ambiguous_send_quarantine',
    })
    .eq('status', 'sending')
    .lt('sending_at', cutoff)
    .select('id')

  if (error) {
    console.error('[recipient-claim] quarantine sweep failed:', error.message)
    return 0
  }

  const swept = (data as unknown as Array<{ id: string }>)?.length ?? 0
  if (swept > 0) {
    console.log(`[recipient-claim] quarantined ${swept} stuck 'sending' recipients (>${Math.round(olderThanMs / 60000)}min)`)
  }
  return swept
}
