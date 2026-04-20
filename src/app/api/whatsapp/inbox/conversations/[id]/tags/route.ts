// =============================================
// API: Conversation Tags
// POST/DELETE /api/whatsapp/inbox/conversations/[id]/tags
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import {
  addTagToConversation,
  removeTagFromConversation,
} from '@/lib/services/whatsapp/conversation-service'

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
    const { name, color } = body

    if (!name) {
      return NextResponse.json({ error: 'Tag name required' }, { status: 400 })
    }

    const result = await addTagToConversation(
      params.id,
      organizationId,
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
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const tagName = searchParams.get('tag')

    if (!organizationId || !tagName) {
      return NextResponse.json(
        { error: 'organizationId and tag required' },
        { status: 400 }
      )
    }

    const result = await removeTagFromConversation(
      params.id,
      organizationId,
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
