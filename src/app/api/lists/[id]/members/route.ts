// =============================================
// WORDER: List members
// GET    /api/lists/[id]/members                  — lista membros
// POST   /api/lists/[id]/members  { contact_ids } — adiciona (idempotent)
// DELETE /api/lists/[id]/members?contact_id=...   — remove
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Garante que a lista pertence à org
async function assertOwnership(listId: string, orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('lists')
    .select('id')
    .eq('id', listId)
    .eq('organization_id', orgId)
    .maybeSingle()
  return !!data
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  if (!(await assertOwnership(params.id, auth.user.organization_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') || 100), 500)
  const offset = Number(searchParams.get('offset') || 0)

  const { data, count, error } = await supabaseAdmin
    .from('list_contacts')
    .select('contact_id, added_at, contact:contacts(id, email, first_name, last_name, phone)', {
      count: 'exact',
    })
    .eq('list_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .order('added_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data || [], total: count || 0 })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  if (!(await assertOwnership(params.id, auth.user.organization_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { contact_ids } = await req.json()
  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return NextResponse.json({ error: 'contact_ids array required' }, { status: 400 })
  }

  // Valida que todos os contact_ids pertencem à org
  const { data: validContacts } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .in('id', contact_ids)
    .eq('organization_id', auth.user.organization_id)
  const validIds = new Set((validContacts || []).map((c) => c.id))
  const rows = contact_ids
    .filter((id) => validIds.has(id))
    .map((contact_id) => ({
      organization_id: auth.user.organization_id,
      list_id: params.id,
      contact_id,
      added_by: auth.user.id,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ added: 0, skipped: contact_ids.length })
  }

  // Upsert para idempotência (unique list_id+contact_id)
  const { error } = await supabaseAdmin
    .from('list_contacts')
    .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ added: rows.length, skipped: contact_ids.length - rows.length })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  if (!(await assertOwnership(params.id, auth.user.organization_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contact_id')
  if (!contactId) {
    return NextResponse.json({ error: 'contact_id required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('list_contacts')
    .delete()
    .eq('list_id', params.id)
    .eq('contact_id', contactId)
    .eq('organization_id', auth.user.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
