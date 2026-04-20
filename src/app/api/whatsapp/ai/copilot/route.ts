// =============================================
// API: AI Copilot Suggestion
// POST /api/whatsapp/ai/copilot
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getCopilotSuggestion } from '@/lib/services/whatsapp/ai-chatbot-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const body = await request.json()
    const { conversationId, lastMessage } = body

    if (!conversationId || !lastMessage) {
      return NextResponse.json(
        { error: 'conversationId and lastMessage required' },
        { status: 400 }
      )
    }

    const result = await getCopilotSuggestion(
      conversationId,
      organizationId,
      lastMessage
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
