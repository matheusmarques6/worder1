/**
 * CRON: Send scheduled WhatsApp campaigns
 * /api/cron/send-scheduled-whatsapp-campaigns
 *
 * A cada minuto, claima atomicamente (RPC FOR UPDATE SKIP LOCKED)
 * whatsapp_campaigns com status='scheduled' e scheduled_at <= now()
 * e dispara campaignProcessor.startCampaign (que enfileira batches
 * no Upstash Redis pro worker Railway processar).
 */

import { NextRequest, NextResponse } from 'next/server'
import { campaignProcessor } from '@/lib/whatsapp/campaign-processor'
import { processDueWhatsappCampaigns } from '@/lib/whatsapp/scheduled-campaigns'

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
    const result = await processDueWhatsappCampaigns({
      startCampaign: (id) => campaignProcessor.startCampaign(id),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
