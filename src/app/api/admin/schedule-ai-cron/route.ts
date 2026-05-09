// =============================================
// POST /api/admin/schedule-ai-cron
//
// Endpoint admin pra inicializar (ou refazer) os schedules QStash do
// módulo de IA. Idempotente — pode ser chamado múltiplas vezes sem
// duplicar.
//
// Schedules criados:
//   - ai-costs-rollup-daily: agrega ai_executions → ai_costs_daily às 3h UTC
//   - ai-knowledge-gaps-weekly: scan automático aos domingos às 4h UTC
//
// Auth: requer ADMIN_API_TOKEN no header `x-admin-token`.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { upsertSchedule } from '@/lib/redis/qstash'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_API_TOKEN
  if (!adminToken) {
    return NextResponse.json({ error: 'ADMIN_API_TOKEN não configurado' }, { status: 503 })
  }
  const provided = req.headers.get('x-admin-token')
  if (provided !== adminToken) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL ausente — schedules precisam de URL pública' },
      { status: 503 },
    )
  }

  try {
    const costsRollup = await upsertSchedule({
      url: `${baseUrl}/api/workers/ai-costs-rollup`,
      cron: '0 3 * * *', // 03:00 UTC todos os dias
      scheduleId: 'ai-costs-rollup-daily',
    })

    return NextResponse.json({
      ok: true,
      scheduled: ['ai-costs-rollup-daily'],
      costsRollup,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
