// =============================================
// P0 — Heartbeat do campaign worker (Railway).
// O worker grava timestamp em Redis a cada health check (30s, TTL 180s).
// O cron whatsapp-dead-alert combina: fila com pending antigo + heartbeat
// ausente/velho => worker morto/travado => alerta.
// =============================================

import { Redis } from '@upstash/redis'

const HEARTBEAT_KEY = 'whatsapp:campaigns:worker:heartbeat'
const HEARTBEAT_TTL_SECONDS = 180

export const STALE_PENDING_THRESHOLD_MS = 10 * 60 * 1000 // job pendente "antigo"
export const HEARTBEAT_MAX_AGE_MS = 2 * 60 * 1000        // heartbeat "recente"

let redis: Redis | null = null
function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
    }
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

/** Chamado pelo worker (Railway) periodicamente. */
export async function beatWorkerHeartbeat(): Promise<void> {
  await getRedis().set(HEARTBEAT_KEY, Date.now(), { ex: HEARTBEAT_TTL_SECONDS })
}

/** Idade do último heartbeat em ms, ou null se ausente/expirado. */
export async function getWorkerHeartbeatAgeMs(): Promise<number | null> {
  const value = await getRedis().get(HEARTBEAT_KEY)
  const ts = Number(value)
  if (!value || !Number.isFinite(ts)) return null
  return Math.max(0, Date.now() - ts)
}

export interface WorkerHealthInput {
  pendingCount: number
  oldestPendingAgeMs: number | null
  heartbeatAgeMs: number | null
}

export interface WorkerHealthResult {
  healthy: boolean
  reason?: string
}

/** Pura — decisão de saúde (testável sem Redis). */
export function evaluateWorkerHealth(input: WorkerHealthInput): WorkerHealthResult {
  const { pendingCount, oldestPendingAgeMs, heartbeatAgeMs } = input

  const hasStaleBacklog =
    pendingCount > 0 &&
    oldestPendingAgeMs !== null &&
    oldestPendingAgeMs > STALE_PENDING_THRESHOLD_MS

  if (!hasStaleBacklog) return { healthy: true }

  const heartbeatFresh = heartbeatAgeMs !== null && heartbeatAgeMs <= HEARTBEAT_MAX_AGE_MS
  if (heartbeatFresh) return { healthy: true } // backlog legítimo, worker vivo

  return {
    healthy: false,
    reason:
      `Fila com ${pendingCount} job(s) pendente(s) há mais de ${Math.round((oldestPendingAgeMs || 0) / 60000)}min ` +
      `e sem heartbeat recente do worker (${heartbeatAgeMs === null ? 'ausente' : Math.round(heartbeatAgeMs / 1000) + 's atrás'}).`,
  }
}
