// =============================================
// Cliente QStash dedicado ao módulo de IA (delays / idempotência).
// Coexiste com src/lib/queue.ts (worker de campanhas) — propósitos
// diferentes. F1 usa estas helpers para o worker /api/workers/ai-respond.
// =============================================

import { Client, Receiver } from '@upstash/qstash'

const token = process.env.QSTASH_TOKEN
export const qstash = token ? new Client({ token }) : null

export const qstashReceiver = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? '',
    })
  : null

/**
 * Agenda execução de um worker via QStash com delay opcional.
 * `deduplicationId` evita disparos duplicados quando o webhook
 * Meta entrega o mesmo evento mais de uma vez.
 */
export async function scheduleWorker(params: {
  url: string
  body: unknown
  delaySeconds?: number
  deduplicationId?: string
}) {
  if (!qstash) {
    console.warn('[qstash] não configurado — worker rodaria síncrono em dev')
    return null
  }
  return qstash.publishJSON({
    url: params.url,
    body: params.body,
    delay: params.delaySeconds,
    deduplicationId: params.deduplicationId,
  })
}

/**
 * Verifica assinatura do webhook QStash. Em dev (sem signing key),
 * retorna true para permitir execução local.
 */
export async function verifyQstashSignature(
  signature: string,
  body: string,
  url: string
): Promise<boolean> {
  if (!qstashReceiver) return true
  try {
    await qstashReceiver.verify({ signature, body, url })
    return true
  } catch {
    return false
  }
}
