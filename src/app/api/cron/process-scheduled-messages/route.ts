/**
 * CRON: Process due scheduled WhatsApp messages
 * /api/cron/process-scheduled-messages
 *
 * A cada minuto: claim pending->processing (UPDATE condicional por linha),
 * envia pelo caminho cloud canônico com opt-out-guard + janela 24h +
 * template APPROVED, e reagenda recorrências (daily/weekly/monthly).
 */

import { NextRequest, NextResponse } from 'next/server'
import { processDueScheduledMessages } from '@/lib/whatsapp/scheduled-message-sender'
import { authorizeCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processDueScheduledMessages()
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
