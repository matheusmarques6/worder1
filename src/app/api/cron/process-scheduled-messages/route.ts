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

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
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
