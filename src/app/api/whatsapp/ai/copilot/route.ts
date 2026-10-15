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

    // Plano IA (15/10/2026), M1 passo 11: com o runtime configurado, a
    // sugestão sai do motor novo (prompt do agente, chave da org, custo em
    // internal.llm_calls como `copilot`). O serviço legado abaixo lê a tabela
    // antiga `whatsapp_conversations` e a chave de plataforma; fica só como
    // fallback de desenvolvimento sem runtime.
    const runtimeUrl = process.env.AGENTS_RUNTIME_URL
    const runtimeToken = process.env.AGENTS_PREVIEW_TOKEN
    if (runtimeUrl && runtimeToken) {
      const upstream = await fetch(`${runtimeUrl.replace(/\/$/, '')}/internal/suggest-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${runtimeToken}` },
        body: JSON.stringify({
          organization_id: organizationId,
          mirror_conversation_id: conversationId,
          last_message: lastMessage,
        }),
        signal: AbortSignal.timeout(45_000),
      })
      const payload = await upstream.json().catch(() => ({}))
      if (!upstream.ok) {
        return NextResponse.json(
          { error: payload?.error || `runtime respondeu ${upstream.status}` },
          { status: upstream.status === 422 ? 422 : 502 }
        )
      }
      return NextResponse.json({ data: { suggestion: payload.suggestion, model: payload.model } })
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
