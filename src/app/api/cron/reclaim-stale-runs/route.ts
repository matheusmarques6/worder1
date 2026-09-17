/**
 * CRON: Reclaim stale automation runs
 * /api/cron/reclaim-stale-runs
 *
 * Recupera runs cujo worker crashou (heartbeat parou).
 * Após 10 minutos sem heartbeat, volta status para 'pending' para outro worker pegar.
 *
 * Roda a cada 5 minutos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { reclaimStaleRuns } from '@/lib/automation/run-lock'
import { authorizeCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const reclaimed = await reclaimStaleRuns(10)
    return NextResponse.json({
      success: true,
      reclaimed,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[reclaim-stale-runs] Error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
