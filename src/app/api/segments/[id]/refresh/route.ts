// POST /api/segments/:id/refresh — force a synchronous full recompute.
//
// Useful when:
//   - the merchant just created/edited the segment and wants the
//     cache populated immediately instead of waiting for the 15-min
//     cron tick
//   - operationally to recover from a long-pending evaluation
//
// Multi-tenant: scoped to user's organizations. Service-role bypass
// not allowed; this is a merchant-triggered action.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveSegment } from '@/lib/segments'
import { checkRateLimit, LIMITS } from '@/lib/segments/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  // Multi-org scope check
  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
  const orgIds = [...new Set([
    auth.user.organization_id,
    ...((memberships || []).map((m: any) => m.organization_id)),
  ])]

  const { data: segment } = await supabaseAdmin
    .from('customer_segments')
    .select('id, organization_id, uses_materialized_cache')
    .eq('id', params.id)
    .in('organization_id', orgIds)
    .maybeSingle()
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Rate-limit per org: refresh is a synchronous full-resolve which
  // can take 30s on a large segment. 10/min keeps operational use
  // (debugging a freshly-edited segment) flowing while blocking
  // accidental loop calls.
  const rate = checkRateLimit(LIMITS.refresh, (segment as any).organization_id)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    )
  }

  // Mark running so concurrent UI requests show a status
  await supabaseAdmin
    .from('customer_segments')
    .update({ evaluation_status: 'running' })
    .eq('id', params.id)

  try {
    const startedAt = Date.now()
    const result = await resolveSegment(supabaseAdmin, params.id, (segment as any).organization_id)

    await supabaseAdmin
      .from('customer_segments')
      .update({
        contact_count: result.contactIds.length,
        last_evaluated_at: new Date().toISOString(),
        last_count_at: new Date().toISOString(),
        evaluation_status: 'idle',
        evaluation_error: null,
      })
      .eq('id', params.id)

    // If the segment opts into materialized cache, reset it to match
    // the freshly computed membership. This is the only path that
    // populates the cache for a newly-created segment — the realtime
    // worker only writes deltas, not initial snapshots.
    if ((segment as any).uses_materialized_cache) {
      await supabaseAdmin
        .from('segment_member_cache')
        .delete()
        .eq('segment_id', params.id)
      if (result.contactIds.length > 0) {
        const rows = result.contactIds.map((contact_id) => ({
          segment_id: params.id,
          contact_id,
          joined_at: new Date().toISOString(),
        }))
        // Insert in chunks to stay within PostgREST payload limits.
        const CHUNK = 1000
        for (let i = 0; i < rows.length; i += CHUNK) {
          await supabaseAdmin
            .from('segment_member_cache')
            .upsert(rows.slice(i, i + CHUNK), { onConflict: 'segment_id,contact_id', ignoreDuplicates: true })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      count: result.contactIds.length,
      duration_ms: Date.now() - startedAt,
      cached: !!(segment as any).uses_materialized_cache,
    })
  } catch (err: any) {
    await supabaseAdmin
      .from('customer_segments')
      .update({
        evaluation_status: 'error',
        evaluation_error: String(err?.message || err),
      })
      .eq('id', params.id)
    return NextResponse.json({ error: err?.message || 'refresh failed' }, { status: 500 })
  }
}
