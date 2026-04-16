/**
 * CRON: Resolve A/B test winners
 * /api/cron/resolve-ab-winners
 *
 * Para cada campanha com ab_test_enabled=true e ab_resolved_at=null cujo
 * sent_at + ab_duration_hours já passou:
 *   - calcula métrica vencedora (open_rate, click_rate ou conversion_rate)
 *   - seta ab_winner ('a' ou 'b') + ab_resolved_at
 *   - (futuro) envia vencedora aos contatos restantes
 *
 * Roda a cada 10 minutos.
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

  try {
    // Busca campanhas com A/B ativo, enviadas, não resolvidas
    const { data: campaigns } = await supabaseAdmin
      .from('email_campaigns')
      .select('id, sent_at, ab_test_enabled, ab_duration_hours, ab_winner_metric')
      .eq('ab_test_enabled', true)
      .is('ab_winner', null)
      .not('sent_at', 'is', null)
      .limit(100)

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ resolved: 0 })
    }

    const now = Date.now()
    const resolved: any[] = []

    for (const camp of campaigns) {
      const sentAtMs = new Date(camp.sent_at).getTime()
      const durationMs = (camp.ab_duration_hours || 4) * 60 * 60 * 1000
      if (now - sentAtMs < durationMs) continue

      // Busca métricas por variant
      const { data: sends } = await supabaseAdmin
        .from('email_sends')
        .select('ab_variant, opened_at, clicked_at, status')
        .eq('campaign_id', camp.id)
        .in('ab_variant', ['a', 'b'])

      if (!sends || sends.length === 0) continue

      const stats = { a: { sent: 0, opened: 0, clicked: 0 }, b: { sent: 0, opened: 0, clicked: 0 } }
      for (const s of sends) {
        const v = s.ab_variant as 'a' | 'b'
        if (!stats[v]) continue
        stats[v].sent++
        if (s.opened_at) stats[v].opened++
        if (s.clicked_at) stats[v].clicked++
      }

      const rate = (variant: 'a' | 'b') => {
        const s = stats[variant]
        if (s.sent === 0) return 0
        if (camp.ab_winner_metric === 'click_rate') return s.clicked / s.sent
        if (camp.ab_winner_metric === 'conversion_rate') return s.clicked / s.sent // conversion proxy
        return s.opened / s.sent
      }

      const winner: 'a' | 'b' = rate('b') > rate('a') ? 'b' : 'a'

      await supabaseAdmin
        .from('email_campaigns')
        .update({
          ab_winner: winner,
          ab_resolved_at: new Date().toISOString(),
        })
        .eq('id', camp.id)

      resolved.push({
        campaign_id: camp.id,
        winner,
        a_rate: rate('a'),
        b_rate: rate('b'),
        stats,
      })
    }

    return NextResponse.json({ resolved: resolved.length, details: resolved })
  } catch (err: any) {
    console.error('[resolve-ab-winners]', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
