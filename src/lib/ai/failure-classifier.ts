/**
 * Classificação de falhas do caminho de resposta da IA (WhatsApp).
 *
 * Os providers (src/lib/whatsapp/ai-providers.ts:114,156,203,237,271) lançam
 * Error genérico com a MESSAGE do provider — sem status code. Por isso a
 * classificação é por padrão textual, com default 'transient' (fail-safe:
 * um permanent classificado como transient custa no máximo MAX_AI_RETRY_ATTEMPTS
 * tentativas; um transient classificado como permanent desligaria o bot).
 *
 * 'skip' = gates intencionais do engine (engine.ts:59,64) — não retentar,
 * não desabilitar, não alertar.
 */
export type AiFailureClass = 'transient' | 'permanent' | 'skip'

const SKIP_PATTERNS: RegExp[] = [
  /agente não está ativo/i,
  /fora do horário de atendimento/i,
]

const PERMANENT_PATTERNS: RegExp[] = [
  /api[ _-]?key/i,            // "Incorrect API key", "invalid x-api-key", "API key não configurada"
  /authentication/i,
  /unauthorized/i,
  /permission[ _]denied/i,
  /model.*(does not exist|not found)/i,
  /model_not_found/i,
  /insufficient_quota/i,
  /exceeded your current quota/i,
  /billing/i,
  /agente não encontrado/i,    // engine.ts:462 — config quebrada, retry não resolve
]

export function classifyAiFailure(error: unknown): AiFailureClass {
  const message =
    error instanceof Error ? error.message : String(error ?? '')
  if (SKIP_PATTERNS.some((re) => re.test(message))) return 'skip'
  if (PERMANENT_PATTERNS.some((re) => re.test(message))) return 'permanent'
  return 'transient'
}

/** Cap de retentativas transient por "rodada" de resposta (zera em sucesso). */
export const MAX_AI_RETRY_ATTEMPTS = 3

/** Backoff por tentativa (1-based): 30s, 2min, 8min. */
const RETRY_DELAYS_SECONDS = [30, 120, 480]

export function computeAiRetryDelaySeconds(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), RETRY_DELAYS_SECONDS.length) - 1
  return RETRY_DELAYS_SECONDS[idx]
}

export type AiRetryPlan =
  | { action: 'retry'; attempt: number; delaySeconds: number }
  | { action: 'give_up'; attempts: number }

/** previousRetryCount = whatsapp_cloud_conversations.ai_retry_count atual. */
export function planAiRetry(previousRetryCount: number): AiRetryPlan {
  const attempt = previousRetryCount + 1
  if (attempt > MAX_AI_RETRY_ATTEMPTS) {
    return { action: 'give_up', attempts: previousRetryCount }
  }
  return { action: 'retry', attempt, delaySeconds: computeAiRetryDelaySeconds(attempt) }
}
