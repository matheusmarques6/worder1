// =============================================
// SEND GUARD — proteção unificada de envio WhatsApp
//
// Reusa o rate limiter por tier da Meta (throughput MPS, pair-rate
// 10/min/destinatário, cota diária) e o circuit breaker que antes só
// protegiam o caminho de CAMPANHAS (campaign-processor.ts:488-581).
// Caminhos interativos (inbox, cloud/messages, IA) chamam:
//   checkBeforeSend() ANTES do envio  -> 429/skip quando bloqueado
//   reportSendResult() DEPOIS do envio -> alimenta breaker/throttle
//
// Chave compartilhada: phone_number_id (o NÚMERO FÍSICO da Meta), não
// whatsapp_business_accounts.id nem whatsapp_instances.id — essas duas
// tabelas podem ter linhas diferentes apontando pro MESMO número, e o
// throughput/pair-rate/cota-diária/circuit-breaker são limites da Meta
// por número físico. Chavear por id de tabela split o estado em dois
// (campanha vs. interativo), permitindo ~2x o limite real. Ver
// campaign-processor.ts:488-489 (mesma chave, phoneNumberId).
//
// Fail-open: indisponibilidade de Redis loga e PERMITE o envio —
// um outage de infra nunca pode derrubar o atendimento humano.
// =============================================

import { getRateLimiter, type RateLimitResult } from './rate-limiter'
import { getCircuitBreaker, type CircuitBreaker } from './circuit-breaker'
import { normalizePhone } from './cloud-api'

export type SendGuardBlockReason =
  | 'circuit_open'
  | 'throttled'
  | 'throughput'
  | 'pair_rate'
  | 'daily_quota'

export interface SendGuardCheckParams {
  /** whatsapp_business_accounts.id — mantido para referência/telemetria */
  accountId: string
  /** Meta phone_number_id — chave REAL do breaker/rate-limiter (compartilhada com campanhas) */
  phoneNumberId: string
  recipientPhone: string
  /** whatsapp_business_accounts.messaging_limit (TIER_250, TIER_1K, ...) */
  messagingLimit?: string | null
}

export interface SendGuardResult {
  allowed: boolean
  reason?: SendGuardBlockReason
  retryAfterMs?: number
  /** Mensagem amigável PT-BR, pronta para a UI do inbox */
  message?: string
}

export interface SendGuardReportParams {
  /** whatsapp_business_accounts.id — mantido para referência/telemetria */
  accountId: string
  /** Meta phone_number_id — chave REAL do breaker/rate-limiter (compartilhada com campanhas) */
  phoneNumberId: string
  success: boolean
  errorCode?: string | number
  error?: Error
  messagingLimit?: string | null
}

// Paridade com campaign-processor.ts:623-633 (mesmo nome => mesmo estado)
const CIRCUIT_RESET_TIMEOUT_MS = 30_000
const CIRCUIT_FAILURE_THRESHOLD = 5

const BLOCK_MESSAGES: Record<SendGuardBlockReason, string> = {
  circuit_open:
    'Envio temporariamente pausado: muitas falhas seguidas nesta conta do WhatsApp. Tente novamente em instantes.',
  throttled:
    'A Meta sinalizou excesso de envios nesta conta. Aguarde alguns minutos antes de tentar de novo.',
  throughput:
    'Muitas mensagens sendo enviadas agora por esta conta. Tente novamente em alguns segundos.',
  pair_rate:
    'Limite da Meta: no máximo 10 mensagens por minuto para o mesmo contato. Aguarde alguns segundos.',
  daily_quota:
    'Limite diário de mensagens desta conta do WhatsApp foi atingido. O limite renova à meia-noite.',
}

/**
 * Mapeia whatsapp_business_accounts.messaging_limit (string da Meta)
 * para o tier numérico do TIER_CONFIG do rate-limiter.
 * Desconhecido => 1 (paridade com campaign-processor: messaging_tier || 1).
 */
export function tierFromMessagingLimit(messagingLimit?: string | null): number {
  switch ((messagingLimit || '').toUpperCase()) {
    case 'TIER_NOT_SET':
    case 'TIER_250':
      return 0
    case 'TIER_1K':
      return 1
    case 'TIER_10K':
      return 2
    case 'TIER_100K':
      return 3
    case 'TIER_UNLIMITED':
      return 4
    default:
      return 1
  }
}

function guardBreaker(phoneNumberId: string): CircuitBreaker {
  return getCircuitBreaker(`wa:${phoneNumberId}`, {
    failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
    resetTimeout: CIRCUIT_RESET_TIMEOUT_MS,
  })
}

function mapRateLimitReason(result: RateLimitResult): SendGuardBlockReason {
  if (result.code) return result.code
  // Fallback defensivo (reason string) — não deve acontecer após a Task 1
  const r = result.reason || ''
  if (r.startsWith('Instance throttled')) return 'throttled'
  if (r.startsWith('Pair rate')) return 'pair_rate'
  if (r.startsWith('Daily limit')) return 'daily_quota'
  return 'throughput'
}

export async function checkBeforeSend(
  params: SendGuardCheckParams,
): Promise<SendGuardResult> {
  const { phoneNumberId, recipientPhone, messagingLimit } = params
  // Normaliza UMA vez antes de montar a chave do pair-rate (10/min/destinatário)
  // — evita fragmentar o bucket por variações do mesmo número (com/sem 9º
  // dígito, com/sem +, espaços etc.), o que na prática desativaria o limite.
  const normalizedPhone = normalizePhone(recipientPhone)
  try {
    // 1. Circuit breaker (compartilhado com campanhas)
    if (!(await guardBreaker(phoneNumberId).canExecute())) {
      return {
        allowed: false,
        reason: 'circuit_open',
        retryAfterMs: CIRCUIT_RESET_TIMEOUT_MS,
        message: BLOCK_MESSAGES.circuit_open,
      }
    }

    // 2. Rate limiter por tier (throttle, MPS, pair-rate, cota diária)
    const limiter = getRateLimiter(phoneNumberId, tierFromMessagingLimit(messagingLimit))
    const rate = await limiter.canSend(normalizedPhone)
    if (!rate.allowed) {
      const reason = mapRateLimitReason(rate)
      return {
        allowed: false,
        reason,
        retryAfterMs: Math.max(1, rate.retryAfter ?? 1) * 1000,
        message: BLOCK_MESSAGES[reason],
      }
    }

    return { allowed: true }
  } catch (e: any) {
    console.warn('[send-guard] check failed (fail-open):', e?.message || e)
    return { allowed: true }
  }
}

export async function reportSendResult(params: SendGuardReportParams): Promise<void> {
  const { phoneNumberId, success, errorCode, error, messagingLimit } = params
  try {
    const breaker = guardBreaker(phoneNumberId)
    if (success) {
      await breaker.recordSuccess()
      return
    }
    const limiter = getRateLimiter(phoneNumberId, tierFromMessagingLimit(messagingLimit))
    await limiter.recordError(errorCode ?? 'UNKNOWN')
    await breaker.recordFailure(error)
  } catch (e: any) {
    console.warn('[send-guard] report failed (ignored):', e?.message || e)
  }
}

/** Body padrão de resposta 429 para as rotas HTTP interativas. */
export function buildRateLimitedResponseBody(check: SendGuardResult): {
  error: string
  code: 'rate_limited'
  reason?: string
  retryAfterMs: number
  retryAfter: number
} {
  const retryAfterMs = check.retryAfterMs ?? 1000
  return {
    error: check.message || 'Limite de envio atingido. Tente novamente em instantes.',
    code: 'rate_limited',
    reason: check.reason,
    retryAfterMs,
    retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  }
}
