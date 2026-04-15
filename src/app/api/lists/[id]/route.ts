// =============================================
// WORDER: Single list — GET/PATCH/DELETE
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const { data: list, error } = await supabaseAdmin
    .from('lists')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ list })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const body = await req.json()
  const allowed = ['name', 'description', 'color']
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k]
  }

  const { data, error } = await supabaseAdmin
    .from('lists')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ list: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  // Cascade deleta membership via FK
  const { error } = await supabaseAdmin
    .from('lists')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
