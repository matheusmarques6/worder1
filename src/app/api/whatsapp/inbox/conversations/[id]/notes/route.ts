// =============================================
// API: Conversation Notes
// GET/POST /api/whatsapp/inbox/conversations/[id]/notes
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendInternalNote } from '@/lib/services/whatsapp/message-service'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { data, error } = await supabaseAdmin
      .from('whatsapp_notes')
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId, userId: authUserId } = auth

    const body = await request.json()
    const { content, agentName } = body

    if (!content) {
      return NextResponse.json(
        { error: 'content required' },
        { status: 400 }
      )
    }

    const result = await sendInternalNote(
      params.id,
      orgId,
      authUserId,
      agentName || 'Agent',
      content
    )

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ data: result.data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
