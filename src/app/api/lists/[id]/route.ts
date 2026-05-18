// GET    /api/lists/:id   — fetch one list
// PATCH  /api/lists/:id   — update name/description/color/icon/archive
// DELETE /api/lists/:id   — archive (soft delete); use ?hard=true for permanent

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

async function userOrgIds(): Promise<string[] | null> {
  const auth = await getAuthClient()
  if (!auth) return null
  const { data } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
  return [...new Set([
    auth.user.organization_id,
    ...((data || []).map((m: any) => m.organization_id)),
  ])]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const orgIds = await userOrgIds()
  if (!orgIds) return authError()

  const { data, error } = await supabaseAdmin
    .from('contact_lists')
    .select('*')
    .eq('id', params.id)
    .in('organization_id', orgIds)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ list: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const orgIds = await userOrgIds()
  if (!orgIds) return authError()

  const body = await req.json().catch(() => ({}))
  const allowed = ['name', 'description', 'color', 'icon', 'is_archived', 'source_metadata']
  const updates: Record<string, any> = {}
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('contact_lists')
    .update(updates)
    .eq('id', params.id)
    .in('organization_id', orgIds)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ list: data })
}

// Default: soft-delete via is_archived flag. ?hard=true for permanent
// (cascades to contact_list_members via FK ON DELETE CASCADE).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const orgIds = await userOrgIds()
  if (!orgIds) return authError()

  const hard = new URL(req.url).searchParams.get('hard') === 'true'
  if (hard) {
    const { error } = await supabaseAdmin
      .from('contact_lists')
      .delete()
      .eq('id', params.id)
      .in('organization_id', orgIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, deleted: 'hard' })
  }

  const { data, error } = await supabaseAdmin
    .from('contact_lists')
    .update({ is_archived: true })
    .eq('id', params.id)
    .in('organization_id', orgIds)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true, deleted: 'soft' })
}
