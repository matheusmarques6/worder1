// =============================================
// ShopifySyncProgress
//
// Inline progress strip that polls /api/shopify/jobs/[id] every 2s
// while a background sync is running. Switches to a done state once
// the worker reports 'completed', or shows the error message on failure.
//
// Designed to slot between the dashboard's sync prompt and the KPI
// row — narrow horizontal bar, no modal. The merchant keeps working.
// =============================================

'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface Props {
  jobId: string
  /** Called when the job reaches a terminal state. Use it to refresh
   *  the dashboard so the new order/revenue counts show up. */
  onComplete?: () => void
  /** Called when the user dismisses the bar. */
  onDismiss?: () => void
}

interface JobStatus {
  id: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  syncType: string
  processedCount: number
  totalCount: number | null
  currentPage: number
  percentage: number | null
  lastError: string | null
  completedAt: string | null
}

const ACTIVE_STATUSES = new Set(['pending', 'running', 'paused'])

export function ShopifySyncProgress({ jobId, onComplete, onDismiss }: Props) {
  const [job, setJob] = useState<JobStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!jobId || dismissed) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      try {
        const res = await fetch(`/api/shopify/jobs/${jobId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setJob(data)
        if (!ACTIVE_STATUSES.has(data.status)) {
          // Terminal — stop polling, notify parent.
          if (data.status === 'completed') onComplete?.()
          return
        }
      } catch { /* network — retry on next tick */ }
      // 2s polling cadence — frequent enough to feel live, low enough
      // to not flood the function with reads while a big sync runs.
      timer = setTimeout(poll, 2000)
    }
    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId, dismissed, onComplete])

  if (!job || dismissed) return null

  const isActive = ACTIVE_STATUSES.has(job.status)
  const isDone = job.status === 'completed'
  const isFail = job.status === 'failed'

  const label =
    job.status === 'pending' ? 'Aguardando início' :
    job.status === 'running' ? 'Sincronizando da Shopify' :
    job.status === 'paused' ? 'Pausado — retomando automaticamente' :
    job.status === 'completed' ? `Sincronização concluída — ${job.processedCount.toLocaleString('pt-BR')} pedidos importados` :
    job.status === 'failed' ? `Falhou: ${job.lastError || 'erro desconhecido'}` :
    job.status

  // Bar color follows status. Indeterminate-style animation when we
  // don't yet have a total to compute a real %.
  const barClass = isFail
    ? 'bg-red-500'
    : isDone
      ? 'bg-emerald-500'
      : 'bg-amber-500'

  const widthPct = job.percentage ?? (job.processedCount > 0 ? Math.min(95, (job.currentPage || 1) * 5) : 5)

  return (
    <div className={`rounded-xl border p-4 ${isFail ? 'border-red-200 bg-red-50' : isDone ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {isFail ? (
            <AlertCircle className="w-5 h-5 text-red-600" />
          ) : isDone ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13.5px] font-semibold ${isFail ? 'text-red-900' : isDone ? 'text-emerald-900' : 'text-amber-900'}`}>
            {label}
          </p>
          {isActive && (
            <p className="text-[11.5px] text-amber-800/80 mt-0.5">
              {job.processedCount.toLocaleString('pt-BR')} pedidos importados
              {job.totalCount ? ` de ${job.totalCount.toLocaleString('pt-BR')}` : ''}
              {job.currentPage ? ` · página ${job.currentPage}` : ''}
            </p>
          )}
          {isActive && (
            <div className="mt-2 h-1.5 w-full bg-amber-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${barClass} transition-all duration-500 ease-out`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          )}
        </div>
        {(isDone || isFail) && (
          <button
            type="button"
            onClick={() => {
              setDismissed(true)
              onDismiss?.()
            }}
            className="shrink-0 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  )
}
