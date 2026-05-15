// =============================================
// WORDER: Lists CRUD
// /src/app/api/lists/route.ts
//
// GET    - lista todas as listas da org
// POST   - cria nova lista
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  // Multi-org lookup: primary + memberships. Without this a user
  // who belongs to two orgs sees only their primary's lists.
  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
  const orgIds = [...new Set([
    auth.user.organization_id,
    ...((memberships || []).map((m: any) => m.organization_id)),
  ])]

  const { data: lists, error } = await supabaseAdmin
    .from('lists')
    .select('id, name, description, color, member_count, created_at, updated_at, organization_id')
    .in('organization_id', orgIds)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lists: lists || [] })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const body = await req.json()
  const { name, description, color } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: list, error } = await supabaseAdmin
    .from('lists')
    .insert({
      organization_id: auth.user.organization_id,
      name,
      description: description || null,
      color: color || '#F97316',
      created_by: auth.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ list }, { status: 201 })
}
