// =============================================
// POST /api/inbox/conversations/[id]/assign-agent
// Atribui (ou desatribui) o agente IA responsável por uma conversa.
// Body: { agentId: string | null }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const agentId: string | null =
    typeof body?.agentId === 'string' && body.agentId.length > 0 ? body.agentId : null

  const supabase = getSupabaseAdmin()

  // Se passou agentId, valida que pertence à mesma org e está publicado.
  if (agentId) {
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('id, organization_id, status')
      .eq('id', agentId)
      .maybeSingle()
    if (!agent || agent.organization_id !== auth.user.organization_id) {
      return NextResponse.json({ error: 'Agente não encontrado nessa organização' }, { status: 404 })
    }
    if (agent.status !== 'published') {
      return NextResponse.json(
        { error: 'Agente precisa estar publicado para responder.' },
        { status: 400 },
      )
    }
  }

  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({
      ai_agent_id: agentId,
      // se desatribuir, despausa também (estado limpo)
      ...(agentId === null
        ? {
            ai_paused: false,
            ai_paused_until: null,
            ai_paused_reason: null,
            ai_paused_by_user_id: null,
          }
        : {}),
    })
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, ai_agent_id: agentId })
}
