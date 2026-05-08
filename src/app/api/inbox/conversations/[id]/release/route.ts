// =============================================
// POST /api/inbox/conversations/[id]/release
// Operador devolve a conversa para a IA: despause + libera atribuição.
// A próxima mensagem do cliente reativa o AgentRunner.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const conversationId = params.id

  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({
      ai_paused: false,
      ai_paused_by_user_id: null,
      ai_paused_reason: null,
      ai_paused_until: null,
    })
    .eq('id', conversationId)
    .eq('organization_id', auth.user.organization_id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
