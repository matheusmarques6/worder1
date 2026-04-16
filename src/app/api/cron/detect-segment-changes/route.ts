/**
 * CRON: Detect segment entry/exit
 * /api/cron/detect-segment-changes
 *
 * Para cada segmento dinâmico em customer_segments, compara membros atuais
 * com snapshot anterior. Para cada NOVO membro, dispara automações.
 *
 * Roda a cada 15 min.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchTrigger } from '@/lib/automation/trigger-dispatcher'
import { resolveByConditions } from '@/lib/segments/resolver'

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

  const start = Date.now()

  try {
    const { data: segments, error } = await supabaseAdmin
      .from('customer_segments')
      .select('id, organization_id, rules, rules_logic, rfm_segments, segment_type')
      .in('segment_type', ['dynamic', 'rfm'])
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let totalEntries = 0
    let segmentsChecked = 0

    for (const seg of segments || []) {
      try {
        const conditions = {
          logic: (seg.rules_logic || 'AND').toLowerCase(),
          rules: seg.rules || [],
        }
        const currentMembers = await resolveByConditions(supabaseAdmin, conditions, seg.organization_id)

        // Snapshot anterior
        const { data: previousSnapshot } = await supabaseAdmin
          .from('segment_memberships_snapshot')
          .select('contact_ids')
          .eq('segment_id', seg.id)
          .maybeSingle()

        const previousSet = new Set<string>((previousSnapshot?.contact_ids as string[]) || [])
        const newEntries = currentMembers.filter((id) => !previousSet.has(id))

        for (const contactId of newEntries) {
          await dispatchTrigger({
            organizationId: seg.organization_id,
            triggerType: 'trigger_segment',
            contactId,
            triggerData: { segment_id: seg.id, event: 'entered' },
            matchConfig: (cfg) => !cfg?.segment_id || cfg.segment_id === seg.id,
            idempotencyKey: `segment_entry:${seg.id}:${contactId}`,
          })
          totalEntries++
        }

        await supabaseAdmin
          .from('segment_memberships_snapshot')
          .upsert({
            segment_id: seg.id,
            organization_id: seg.organization_id,
            contact_ids: currentMembers,
            snapshotted_at: new Date().toISOString(),
          })

        segmentsChecked++
      } catch (e: any) {
        console.error(`[detect-segment] segment ${seg.id} error:`, e?.message)
      }
    }

    return NextResponse.json({
      success: true,
      segmentsChecked,
      entriesDispatched: totalEntries,
      durationMs: Date.now() - start,
    })
  } catch (err: any) {
    console.error('[detect-segment-changes] error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
