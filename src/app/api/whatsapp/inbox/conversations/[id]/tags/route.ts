// =============================================
// API: Conversation Tags
// POST/DELETE /api/whatsapp/inbox/conversations/[id]/tags
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import {
  addTagToConversation,
  removeTagFromConversation,
} from '@/lib/services/whatsapp/conversation-service'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const body = await request.json()
    const { name, color } = body

    if (!name) {
      return NextResponse.json({ error: 'Tag name required' }, { status: 400 })
    }

    const result = await addTagToConversation(
      params.id,
      orgId,
      name,
      color
    )

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { searchParams } = new URL(request.url)
    const tagName = searchParams.get('tag')

    if (!tagName) {
      return NextResponse.json(
        { error: 'tag required' },
        { status: 400 }
      )
    }

    const result = await removeTagFromConversation(
      params.id,
      orgId,
      tagName
    )

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
