// =============================================
// WORDER: Automation run lock (optimistic concurrency)
// /src/lib/automation/run-lock.ts
//
// Uso:
//   const lock = await claimRun(runId)
//   if (!lock) return // outro worker pegou
//   try {
//     await doWork(lock)
//     await releaseRun(runId, lock.token, 'completed', null, result)
//   } catch (err) {
//     await releaseRun(runId, lock.token, 'failed', err.message)
//   }
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import crypto from 'crypto'

export interface RunLock {
  runId: string
  token: string
  automationId: string
  contactId: string | null
  dealId: string | null
  metadata: Record<string, any>
  status: string
}

const WORKER_ID =
  process.env.VERCEL_REGION
    ? `vercel-${process.env.VERCEL_REGION}-${process.pid}`
    : `worker-${process.pid}`

/**
 * Tenta adquirir o lock para o run. Retorna null se outro worker já pegou.
 */
export async function claimRun(runId: string): Promise<RunLock | null> {
  const token = crypto.randomUUID()
  const { data, error } = await supabaseAdmin.rpc('claim_automation_run', {
    p_run_id: runId,
    p_worker_id: WORKER_ID,
    p_new_token: token,
    p_stale_lock_minutes: 5,
  })

  if (error) {
    console.error('[run-lock] claim error:', error)
    return null
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    runId: row.id,
    token: row.lock_token,
    automationId: row.automation_id,
    contactId: row.contact_id,
    dealId: row.deal_id,
    metadata: row.metadata || {},
    status: row.status,
  }
}

/**
 * Atualiza heartbeat para manter lock durante execução longa.
 * Retorna false se outro worker já tomou o lock (nesse caso, pare imediatamente).
 */
export async function heartbeat(runId: string, token: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('heartbeat_automation_run', {
    p_run_id: runId,
    p_token: token,
  })
  if (error) {
    console.warn('[run-lock] heartbeat error:', error.message)
    return false
  }
  return Boolean(data)
}

/**
 * Libera o lock setando o status final. Só sucede se o token ainda é válido
 * (protege contra workers zumbis escrevendo após stale).
 */
export async function releaseRun(
  runId: string,
  token: string,
  status: 'completed' | 'failed' | 'cancelled' | 'waiting' | 'paused',
  error?: string | null,
  result?: Record<string, any> | null
): Promise<boolean> {
  const { data, error: err } = await supabaseAdmin.rpc('release_automation_run', {
    p_run_id: runId,
    p_token: token,
    p_new_status: status,
    p_error: error || null,
    p_result: result || null,
  })
  if (err) {
    console.error('[run-lock] release error:', err)
    return false
  }
  return Boolean(data)
}

/**
 * Cron helper: recupera runs com heartbeat stale.
 */
export async function reclaimStaleRuns(minutes: number = 10): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('reclaim_stale_automation_runs', {
    p_minutes: minutes,
  })
  if (error) {
    console.error('[run-lock] reclaim error:', error)
    return 0
  }
  return Number(data || 0)
}

/**
 * Executa fn com heartbeat periódico automático.
 * Se heartbeat falhar (lock perdido), chama abort() e fn pode interromper.
 */
export async function withHeartbeat<T>(
  runId: string,
  token: string,
  fn: (abort: () => boolean) => Promise<T>,
  intervalMs: number = 15_000
): Promise<T> {
  let lost = false
  const abort = () => lost

  const timer = setInterval(async () => {
    const ok = await heartbeat(runId, token)
    if (!ok) {
      lost = true
      clearInterval(timer)
    }
  }, intervalMs)

  try {
    return await fn(abort)
  } finally {
    clearInterval(timer)
  }
}
