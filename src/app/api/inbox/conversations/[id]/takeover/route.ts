// =============================================
// POST /api/inbox/conversations/[id]/takeover
// Operador humano assume a conversa: pausa a IA, atribui o usuário,
// e cancela qualquer execução pendente do worker (drain do buffer Redis).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { redis } from '@/lib/redis/client'

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
      ai_paused: true,
      ai_paused_by_user_id: auth.user.id,
      ai_paused_reason: 'human_takeover',
      assigned_agent_id: auth.user.id,
      assigned_to: auth.user.id,
    })
    .eq('id', conversationId)
    .eq('organization_id', auth.user.organization_id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Limpa buffer e lock pendente (se Redis configurado)
  if (redis) {
    await Promise.all([
      redis.del(`ai:buffer:${conversationId}`),
      redis.del(`ai:lock:${conversationId}`),
    ])
  }

  return NextResponse.json({ success: true })
}
