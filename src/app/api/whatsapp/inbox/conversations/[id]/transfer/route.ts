// =============================================
// API: Transfer Conversation
// POST /api/whatsapp/inbox/conversations/[id]/transfer
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { transferConversation } from '@/lib/services/whatsapp/conversation-service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const body = await request.json()
    const { toAgentId, toQueueId, reason, fromAgentId, fromAgentName } = body

    if (!toAgentId && !toQueueId) {
      return NextResponse.json(
        { error: 'toAgentId or toQueueId required' },
        { status: 400 }
      )
    }

    const result = await transferConversation({
      conversationId: params.id,
      organizationId,
      fromAgentId,
      fromAgentName,
      toAgentId,
      toQueueId,
      reason,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ data: result.data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
