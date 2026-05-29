// =============================================
// API: CSAT Rating
// POST /api/whatsapp/inbox/conversations/[id]/csat
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId, userId: authUserId } = auth

    const body = await request.json()
    const { rating, comment, contactId } = body

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('whatsapp_csat_ratings')
      .insert({
        organization_id: orgId,
        conversation_id: params.id,
        contact_id: contactId,
        agent_id: authUserId,
        rating,
        comment,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { data, error } = await supabaseAdmin
      .from('whatsapp_csat_ratings')
      .select('*')
      .eq('conversation_id', params.id)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
