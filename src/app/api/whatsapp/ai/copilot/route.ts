// =============================================
// API: AI Copilot Suggestion
// POST /api/whatsapp/ai/copilot
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getCopilotSuggestion } from '@/lib/services/whatsapp/ai-chatbot-service'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // ✅ P1 v2: org do token; organizationId da query é IGNORADO
  // (CopilotSidebar.tsx usa fetch() same-origin → cookie flui)
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const organizationId = auth.orgId

  try {
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
