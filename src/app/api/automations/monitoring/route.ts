// =============================================
// WORDER: Automation monitoring & alerts
// GET /api/automations/monitoring
//
// Retorna em real-time:
// - Automações com alta taxa de falha nas últimas 24h
// - Dead letter queue size
// - Runs em 'running' há mais de 10min (suspicious)
// - Throughput últimas 24h
// - Top 5 erros mais comuns
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id

  const now = new Date()
  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const tenMin = new Date(now.getTime() - 10 * 60 * 1000).toISOString()

  try {
    // Runs nas últimas 24h agrupados por status + automation
    const { data: recentRuns } = await supabaseAdmin
      .from('automation_runs')
      .select('id, automation_id, status, last_error, created_at, started_at, completed_at')
      .eq('organization_id', orgId)
      .gte('created_at', day)
      .limit(10000)

    const runs = recentRuns || []

    // Por automação
    const byAutomation = new Map<string, { total: number; success: number; failed: number; running: number; waiting: number }>()
    for (const r of runs) {
      const rec = byAutomation.get(r.automation_id) || { total: 0, success: 0, failed: 0, running: 0, waiting: 0 }
      rec.total++
      if (r.status === 'completed') rec.success++
      else if (r.status === 'failed') rec.failed++
      else if (r.status === 'running') rec.running++
      else if (r.status === 'waiting') rec.waiting++
      byAutomation.set(r.automation_id, rec)
    }

    // Automações com alta taxa de falha (>20%)
    const alerts: any[] = []
    for (const [autoId, stats] of byAutomation) {
      const failureRate = stats.total > 0 ? stats.failed / stats.total : 0
      if (failureRate > 0.2 && stats.total >= 10) {
        alerts.push({
          type: 'high_failure_rate',
          severity: 'warning',
          automationId: autoId,
          message: `Taxa de falha ${(failureRate * 100).toFixed(0)}% em 24h (${stats.failed}/${stats.total})`,
          stats,
        })
      }
    }

    // Runs presas em 'running' há mais de 10min (worker crashou antes do reclaim cron)
    const stuck = runs.filter((r) =>
      r.status === 'running' && r.started_at && r.started_at < tenMin
    )
    if (stuck.length > 0) {
      alerts.push({
        type: 'stuck_runs',
        severity: 'error',
        count: stuck.length,
        message: `${stuck.length} runs presas em "running" há mais de 10min`,
      })
    }

    // Top 5 erros
    const errorCounts = new Map<string, number>()
    for (const r of runs) {
      if (r.status === 'failed' && r.last_error) {
        const key = r.last_error.slice(0, 100)
        errorCounts.set(key, (errorCounts.get(key) || 0) + 1)
      }
    }
    const topErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Throughput por hora (últimas 24h)
    const hourly: Record<string, { total: number; success: number; failed: number }> = {}
    for (let h = 23; h >= 0; h--) {
      const d = new Date(now.getTime() - h * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 13) + ':00'
      hourly[key] = { total: 0, success: 0, failed: 0 }
    }
    for (const r of runs) {
      const key = r.created_at.slice(0, 13) + ':00'
      if (hourly[key]) {
        hourly[key].total++
        if (r.status === 'completed') hourly[key].success++
        if (r.status === 'failed') hourly[key].failed++
      }
    }

    // Dead letter queue size (email-send-batch)
    let deadLetters = 0
    try {
      const { stats } = await import('@/lib/queue/durable-queue')
      const qs = await stats('email-send-batch')
      deadLetters = qs.dead
    } catch { /* redis não configurado */ }

    // Stats agregadas
    const totals = {
      total24h: runs.length,
      completed24h: runs.filter((r) => r.status === 'completed').length,
      failed24h: runs.filter((r) => r.status === 'failed').length,
      running: runs.filter((r) => r.status === 'running').length,
      waiting: runs.filter((r) => r.status === 'waiting').length,
      deadLetters,
      activeAutomations: 0,
    }

    const { count: active } = await supabaseAdmin
      .from('automations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'active')
    totals.activeAutomations = active || 0

    return NextResponse.json({
      totals,
      alerts,
      topErrors,
      hourly: Object.entries(hourly).map(([t, v]) => ({ time: t, ...v })),
      perAutomation: Array.from(byAutomation.entries()).map(([id, s]) => ({
        automationId: id,
        ...s,
        failureRate: s.total > 0 ? s.failed / s.total : 0,
      })),
    })
  } catch (err: any) {
    console.error('[automations/monitoring] error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}
