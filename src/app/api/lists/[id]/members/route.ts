// GET    /api/lists/:id/members            — paginated list of members + contact data
// POST   /api/lists/:id/members            — add by { contact_ids: [...] } (idempotent)
// DELETE /api/lists/:id/members?contact_id — remove one contact

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

async function userOrgIds(): Promise<{ userId: string; orgIds: string[] } | null> {
  const auth = await getAuthClient()
  if (!auth) return null
  const { data } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
  return {
    userId: auth.user.id,
    orgIds: [...new Set([
      auth.user.organization_id,
      ...((data || []).map((m: any) => m.organization_id)),
    ])],
  }
}

async function assertListOwnership(listId: string, orgIds: string[]): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('contact_lists')
    .select('organization_id')
    .eq('id', listId)
    .in('organization_id', orgIds)
    .maybeSingle()
  return data ? (data as any).organization_id : null
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await userOrgIds()
  if (!ctx) return authError()

  if (!(await assertListOwnership(params.id, ctx.orgIds))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') || 100), 500)
  const offset = Math.max(0, Number(searchParams.get('offset') || 0))

  // Two-step query: first the member rows, then the contact hydration.
  // Doing it via PostgREST join would force an inner select and lose
  // the count; this way we keep count and stay flexible.
  const { data: rows, count, error } = await supabaseAdmin
    .from('contact_list_members')
    .select('contact_id, added_at, added_by, source', { count: 'exact' })
    .eq('list_id', params.id)
    .order('added_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const contactIds = (rows || []).map((r: any) => r.contact_id)
  let contactsById: Record<string, any> = {}
  if (contactIds.length) {
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, phone, total_orders, total_spent, lifecycle_stage')
      .in('id', contactIds)
    for (const c of contacts || []) contactsById[c.id as string] = c
  }

  const members = (rows || []).map((r: any) => ({
    contact_id: r.contact_id,
    added_at: r.added_at,
    added_by: r.added_by,
    source: r.source,
    contact: contactsById[r.contact_id] || null,
  }))

  return NextResponse.json({ members, total: count ?? 0, limit, offset })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await userOrgIds()
  if (!ctx) return authError()

  const listOrgId = await assertListOwnership(params.id, ctx.orgIds)
  if (!listOrgId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.contact_ids) ? body.contact_ids : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'contact_ids array required' }, { status: 400 })
  }

  // Validate ownership: each contact_id must belong to the list's org.
  const { data: valid } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .in('id', ids)
    .eq('organization_id', listOrgId)
  const validIds = new Set((valid || []).map((c: any) => c.id))

  const rows = ids
    .filter((id) => validIds.has(id))
    .map((contact_id) => ({
      list_id: params.id,
      contact_id,
      added_by: ctx.userId,
      source: body.source || 'manual',
    }))

  if (rows.length === 0) {
    return NextResponse.json({ added: 0, skipped: ids.length })
  }

  const { error } = await supabaseAdmin
    .from('contact_list_members')
    .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ added: rows.length, skipped: ids.length - rows.length })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await userOrgIds()
  if (!ctx) return authError()

  if (!(await assertListOwnership(params.id, ctx.orgIds))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const contactId = new URL(req.url).searchParams.get('contact_id')
  if (!contactId) {
    return NextResponse.json({ error: 'contact_id required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('contact_list_members')
    .delete()
    .eq('list_id', params.id)
    .eq('contact_id', contactId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
