// PUT /api/segments/:id/rule-v2 — persist a v2 SegmentRule
//
// Validates with the DSL validator, extracts dependencies, and writes
// back to customer_segments with rule_version=2. Idempotent.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { validateSegmentRule, extractDependencies } from '@/lib/segments'

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const body = await req.json().catch(() => ({}))
  const validation = validateSegmentRule(body.rule)
  if (!validation.ok) {
    return NextResponse.json({ error: 'invalid rule', details: validation.errors }, { status: 400 })
  }

  // Confirm the segment belongs to one of the user's orgs.
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
    .select('id, organization_id')
    .eq('id', params.id)
    .in('organization_id', orgIds)
    .maybeSingle()
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const deps = extractDependencies(validation.rule)

  const { error } = await supabaseAdmin
    .from('customer_segments')
    .update({
      rules: validation.rule,
      rule_version: 2,
      rule_dependencies: deps,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, dependencies: deps })
}
