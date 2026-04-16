// =============================================
// WORDER: Deal Activities/Notes API
// GET  — lista activities do deal (timeline)
// POST — cria nota/call/email/meeting/task
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface RouteParams { params: { id: string } }

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const dealId = params.id
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const limit = Math.min(Number(searchParams.get('limit') || 100), 500)
  const offset = Number(searchParams.get('offset') || 0)

  let q = supabaseAdmin
    .from('deal_activities')
    .select('*, user:profiles(id, full_name, email, avatar_url)', { count: 'exact' })
    .eq('deal_id', dealId)
    .eq('organization_id', auth.user.organization_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type) q = q.eq('activity_type', type)

  const { data, count, error } = await q
  if (error) {
    console.warn('[deal/activities GET]', error.message)
    return NextResponse.json({ activities: [], total: 0 })
  }
  return NextResponse.json({ activities: data || [], total: count || 0 })
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const dealId = params.id
  const body = await req.json()
  const { activity_type, title, description, metadata, contact_id, due_at, is_pinned } = body

  if (!activity_type) {
    return NextResponse.json({ error: 'activity_type required' }, { status: 400 })
  }

  // Verificar que deal pertence à org
  const { data: deal } = await supabaseAdmin
    .from('deals')
    .select('id')
    .eq('id', dealId)
    .eq('organization_id', auth.user.organization_id)
    .maybeSingle()

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const { data: activity, error } = await supabaseAdmin
    .from('deal_activities')
    .insert({
      organization_id: auth.user.organization_id,
      deal_id: dealId,
      user_id: auth.user.id,
      contact_id: contact_id || null,
      activity_type,
      title: title || null,
      description: description || null,
      metadata: metadata || {},
      is_pinned: is_pinned || false,
      due_at: due_at || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity }, { status: 201 })
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const body = await req.json()
  const { activity_id, ...updates } = body

  if (!activity_id) return NextResponse.json({ error: 'activity_id required' }, { status: 400 })

  const allowed = ['title', 'description', 'metadata', 'is_pinned', 'due_at', 'completed_at']
  const clean: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (updates[k] !== undefined) clean[k] = updates[k]
  }

  const { data, error } = await supabaseAdmin
    .from('deal_activities')
    .update(clean)
    .eq('id', activity_id)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const { searchParams } = new URL(req.url)
  const activityId = searchParams.get('activity_id')
  if (!activityId) return NextResponse.json({ error: 'activity_id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('deal_activities')
    .delete()
    .eq('id', activityId)
    .eq('organization_id', auth.user.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
