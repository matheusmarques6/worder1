// /api/lists — CRUD for static contact lists.
//
// Lists are the static counterpart to segments. Membership is managed
// by hand (manual add, CSV import, form opt-in, integration) and lives
// in contact_list_members. The legacy `lists` table is empty in
// production; this endpoint targets the new contact_lists table that
// the v2 segmentation work introduced.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { asUuid } from '@/lib/segments/validate'

export const dynamic = 'force-dynamic'

async function orgScope(): Promise<{ userId: string; primaryOrg: string; orgIds: string[] } | null> {
  const auth = await getAuthClient()
  if (!auth) return null
  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
  const orgIds = [...new Set([
    auth.user.organization_id,
    ...((memberships || []).map((m: any) => m.organization_id)),
  ])]
  return { userId: auth.user.id, primaryOrg: auth.user.organization_id, orgIds }
}

// GET /api/lists  →  Query: ?store_id=...&include_archived=true
export async function GET(req: NextRequest) {
  const ctx = await orgScope()
  if (!ctx) return authError()

  const { searchParams } = new URL(req.url)
  // Validate as UUID before interpolating into a PostgREST filter
  // string — a value with commas/parens would break out of .or() and
  // could compose unexpected filter logic. asUuid returns null for
  // anything that doesn't match the canonical UUID pattern.
  const storeId = asUuid(searchParams.get('store_id'))
  const includeArchived = searchParams.get('include_archived') === 'true'

  let q: any = supabaseAdmin
    .from('contact_lists')
    .select('id, name, description, color, icon, source, source_metadata, total_contacts, is_archived, store_id, organization_id, created_at, updated_at')
    .in('organization_id', ctx.orgIds)
    .order('updated_at', { ascending: false })

  if (!includeArchived) q = q.eq('is_archived', false)
  if (storeId) q = q.or(`store_id.eq.${storeId},store_id.is.null`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // no-store: prevents the browser from showing store A's lists on a
  // back-button or F5 after the user switched to store B. The query
  // string already includes ?store_id so cache keys differ, but we
  // belt-and-suspenders against intermediaries that ignore that.
  return NextResponse.json({ lists: data || [] }, {
    headers: { 'Cache-Control': 'no-store, private, max-age=0' },
  })
}

// POST /api/lists  →  { name, description?, color?, icon?, source?, store_id?, organization_id? }
export async function POST(req: NextRequest) {
  const ctx = await orgScope()
  if (!ctx) return authError()

  let body: any = {}
  try { body = await req.json() } catch {}
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  const orgId = body.organization_id || ctx.primaryOrg
  if (!ctx.orgIds.includes(orgId)) {
    return NextResponse.json({ error: 'invalid organization_id' }, { status: 403 })
  }

  // Validate store_id ownership. Without this an attacker could POST
  // { name:'x', store_id:'<victim-store-id>' } and create a list
  // bound to another org's store. The list itself can't leak data
  // (org-id is correct), but it would clutter the victim's UI and
  // potentially get picked up by their pickers.
  let storeId: string | null = body.store_id || null
  if (storeId) {
    const { data: storeRow } = await supabaseAdmin
      .from('shopify_stores')
      .select('id')
      .eq('id', storeId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (!storeRow) {
      return NextResponse.json({ error: 'store_id does not belong to this organization' }, { status: 403 })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('contact_lists')
    .insert({
      organization_id: orgId,
      store_id: storeId,
      name: body.name.trim(),
      description: body.description || null,
      color: body.color || '#F97316',
      icon: body.icon || null,
      source: body.source || 'manual',
      source_metadata: body.source_metadata || {},
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ list: data }, { status: 201 })
}
