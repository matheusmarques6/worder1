/**
 * CRON: Send scheduled email campaigns
 * /api/cron/send-scheduled-campaigns
 *
 * A cada minuto, busca campanhas com status='scheduled' e scheduled_at <= now
 * e dispara o fluxo de envio (chama /api/email/campaigns/send internamente).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

  const nowIso = new Date().toISOString()
  const { data: due, error } = await supabaseAdmin
    .from('email_campaigns')
    .select('id, organization_id, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ dispatched: 0 })

  // Marca como 'sending' atomicamente para evitar dupla execução
  // via condicional UPDATE
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const cronSecret = process.env.CRON_SECRET || ''

  const results: any[] = []
  for (const camp of due) {
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('email_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', camp.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()

    if (claimErr || !claimed) {
      results.push({ id: camp.id, claimed: false })
      continue
    }

    // Chama /send (sem auth de usuário — passa internal header)
    try {
      const res = await fetch(`${baseUrl}/api/email/campaigns/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal': 'true',
          'X-Org-Id': camp.organization_id,
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ campaign_id: camp.id }),
      })
      results.push({ id: camp.id, ok: res.ok, status: res.status })
    } catch (err: any) {
      results.push({ id: camp.id, ok: false, error: err?.message })
      // Volta pra scheduled pra tentar de novo
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'scheduled' })
        .eq('id', camp.id)
    }
  }

  return NextResponse.json({ dispatched: results.length, results })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
