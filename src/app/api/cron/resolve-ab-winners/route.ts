/**
 * CRON: Resolve A/B test winners + send winner to remaining contacts
 * /api/cron/resolve-ab-winners
 *
 * Para cada campanha com ab_test_enabled=true e ab_resolved_at=null cujo
 * sent_at + ab_duration_hours já passou:
 *   1. Calcula métrica vencedora (open_rate, click_rate ou conversion_rate)
 *   2. Seta ab_winner ('a' ou 'b') + ab_resolved_at
 *   3. Envia a variante vencedora aos contatos que ainda não receberam
 *
 * Roda a cada 10 minutos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
    const { data: campaigns } = await supabaseAdmin
      .from('email_campaigns')
      .select('id, organization_id, segment_id, store_id, sent_at, created_at, ab_test_enabled, ab_test_percent, ab_duration_hours, ab_winner_metric, ab_variant_b')
      .eq('ab_test_enabled', true)
      .is('ab_winner', null)
      .not('sent_at', 'is', null)
      .limit(100)

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ resolved: 0 })
    }

    const now = Date.now()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
    const resolved: any[] = []

    for (const camp of campaigns) {
      const sentAtMs = new Date(camp.sent_at).getTime()
      const durationMs = (camp.ab_duration_hours || 4) * 60 * 60 * 1000
      if (now - sentAtMs < durationMs) continue

      const { data: sends } = await supabaseAdmin
        .from('email_sends')
        .select('ab_variant, opened_at, clicked_at, status, contact_id')
        .eq('campaign_id', camp.id)
        .in('ab_variant', ['a', 'b'])

      if (!sends || sends.length === 0) continue

      const stats = { a: { sent: 0, opened: 0, clicked: 0 }, b: { sent: 0, opened: 0, clicked: 0 } }
      const alreadySentContactIds = new Set<string>()

      for (const s of sends) {
        const v = s.ab_variant as 'a' | 'b'
        if (!stats[v]) continue
        stats[v].sent++
        if (s.opened_at) stats[v].opened++
        if (s.clicked_at) stats[v].clicked++
        if (s.contact_id) alreadySentContactIds.add(s.contact_id)
      }

      // For conversion_rate, query actual orders attributed to each variant
      // instead of using clicks (clicks != conversions).
      let conversionsByVariant = { a: 0, b: 0 }
      if (camp.ab_winner_metric === 'conversion_rate') {
        try {
          const contactsByVariant = { a: [] as string[], b: [] as string[] }
          for (const s of sends) {
            if (s.contact_id && s.ab_variant) {
              contactsByVariant[s.ab_variant as 'a' | 'b']?.push(s.contact_id)
            }
          }
          for (const v of ['a', 'b'] as const) {
            if (contactsByVariant[v].length === 0) continue
            const { count } = await supabaseAdmin
              .from('contact_events')
              .select('id', { count: 'exact', head: true })
              .in('contact_id', contactsByVariant[v])
              .in('event_type', ['placed_order', 'order_paid', 'checkout_completed'])
              .gte('occurred_at', camp.sent_at || camp.created_at)
            conversionsByVariant[v] = count || 0
          }
        } catch { /* fall back to clicks if query fails */ }
      }

      const rate = (variant: 'a' | 'b') => {
        const s = stats[variant]
        if (s.sent === 0) return 0
        if (camp.ab_winner_metric === 'click_rate') return s.clicked / s.sent
        if (camp.ab_winner_metric === 'conversion_rate') {
          return conversionsByVariant[variant] / s.sent
        }
        return s.opened / s.sent
      }

      // Require minimum sample size for statistical relevance
      const minSample = 30
      const hasEnoughData = stats.a.sent >= minSample && stats.b.sent >= minSample
      if (!hasEnoughData) {
        console.warn(`[AB] Campaign ${camp.id} — insufficient sample (a=${stats.a.sent}, b=${stats.b.sent}), skipping`)
        continue
      }

      const winner: 'a' | 'b' = rate('b') > rate('a') ? 'b' : 'a'

      // NOTE: ab_winner is intentionally NOT set here. It must be marked ONLY
      // AFTER the winner broadcast below completes successfully — otherwise the
      // `.is('ab_winner', null)` guard would exclude this campaign on the next
      // run and the rest of the audience would never receive the winner if a
      // send-batch fetch failed. See the "Mark resolved" block after the loop.

      // ── Send winner to remaining contacts ──
      // Resolve full contact list and subtract already-sent
      let remainingContactIds: string[] = []
      let resolveFailed = false
      try {
        let allContactIds: string[] = []

        if (camp.segment_id) {
          // Route through the canonical entrypoint (index.ts) so v1 and
          // v2 segments both resolve correctly — it detects rule_version
          // and runs the v1→v2 adapter, fixing the date-NaN and
          // unreadable-v2 rules bugs in the legacy resolver.
          const { resolveSegment } = await import('@/lib/segments')
          const resolved = await resolveSegment(supabaseAdmin, camp.segment_id, camp.organization_id)
          allContactIds = resolved.contactIds
        } else {
          let q: any = supabaseAdmin
            .from('contacts')
            .select('id')
            .eq('organization_id', camp.organization_id)
            .eq('is_subscribed_email', true)
            .not('email', 'is', null)
          if (camp.store_id) q = q.eq('store_id', camp.store_id)
          const { data } = await q
          allContactIds = (data || []).map((c: any) => c.id)
        }

        remainingContactIds = allContactIds.filter(id => !alreadySentContactIds.has(id))
      } catch (e: any) {
        resolveFailed = true
        console.error(`[AB-Winner] Failed to resolve remaining contacts for ${camp.id}:`, e?.message)
      }

      // If we couldn't even resolve the audience, do NOT mark resolved — leave
      // ab_winner null so the next cron run retries.
      if (resolveFailed) {
        console.warn(`[AB] Campaign ${camp.id} — audience resolution failed, leaving unresolved for retry`)
        continue
      }

      let remainingSent = 0
      let broadcastFailed = false
      if (remainingContactIds.length > 0) {
        const BATCH_SIZE = 50
        const batches = []
        for (let i = 0; i < remainingContactIds.length; i += BATCH_SIZE) {
          batches.push(remainingContactIds.slice(i, i + BATCH_SIZE))
        }

        for (let i = 0; i < batches.length; i++) {
          try {
            const resp = await fetch(`${baseUrl}/api/email/campaigns/send-batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Internal': 'true' },
              body: JSON.stringify({
                campaign_id: camp.id,
                contact_ids: batches[i],
                contact_variants: batches[i].map(id => ({ id, variant: winner })),
                batch_number: i + 1,
                total_batches: batches.length,
                organizationId: camp.organization_id,
              }),
            })
            // fetch() does not throw on HTTP 4xx/5xx — must inspect resp.ok.
            if (!resp.ok) {
              broadcastFailed = true
              console.error(`[AB-Winner] Batch ${i + 1} HTTP ${resp.status} for ${camp.id}`)
              continue
            }
            remainingSent += batches[i].length
          } catch (e: any) {
            broadcastFailed = true
            console.error(`[AB-Winner] Batch ${i + 1} failed for ${camp.id}:`, e?.message)
          }
        }

        console.log(`[AB-Winner] Sent winner '${winner}' to ${remainingSent} remaining contacts for campaign ${camp.id}`)
      }

      // If any batch failed, leave ab_winner null so the next cron run retries.
      // Contacts already sent the winner are excluded via alreadySentContactIds
      // (recomputed from email_sends each run), so retries do NOT double-send.
      if (broadcastFailed) {
        console.warn(`[AB] Campaign ${camp.id} — broadcast incomplete (sent ${remainingSent}), leaving unresolved for retry`)
        continue
      }

      // ── Mark resolved ── (exactly once, only after a fully successful
      // broadcast — or when there was nothing left to send). This is what makes
      // the next run's `.is('ab_winner', null)` guard skip the campaign.
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
        remaining_sent: remainingSent,
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
