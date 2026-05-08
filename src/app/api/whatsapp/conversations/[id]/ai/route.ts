// =====================================================
// API PARA CONTROLAR IA EM CONVERSAS
// GET/POST /api/whatsapp/conversations/[id]/ai
//
// Reescrita para usar o schema canônico (ai_paused / ai_paused_*).
// Convertemos para `ai_enabled` apenas no contrato externo, mantendo
// retrocompatibilidade com o componente AIToggleButton.
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

interface ConversationAIRow {
  id: string
  ai_paused: boolean | null
  ai_agent_id: string | null
  ai_paused_until: string | null
  ai_paused_reason: string | null
  ai_paused_by_user_id: string | null
}

function toExternalShape(row: ConversationAIRow) {
  return {
    conversationId: row.id,
    ai_enabled: !(row.ai_paused ?? false),
    ai_paused: row.ai_paused ?? false,
    ai_agent_id: row.ai_agent_id,
    ai_disabled_at: row.ai_paused_until,
    ai_disabled_reason: row.ai_paused_reason,
    ai_paused_by_user_id: row.ai_paused_by_user_id,
  }
}

// GET — status atual
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const conversationId = params.id

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select('id, ai_paused, ai_agent_id, ai_paused_until, ai_paused_reason, ai_paused_by_user_id')
      .eq('id', conversationId)
      .single()

    if (error || !conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    return NextResponse.json(toExternalShape(conversation as ConversationAIRow))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — alterar status (action: enable | disable | toggle)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const conversationId = params.id
    const body = await request.json()
    const { action, reason } = body as { action?: string; reason?: string }

    const { data: conversation, error: fetchError } = await supabase
      .from('whatsapp_conversations')
      .select('id, ai_paused, ai_agent_id, ai_paused_until, ai_paused_reason, ai_paused_by_user_id')
      .eq('id', conversationId)
      .single()
    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    const currentlyPaused = (conversation as ConversationAIRow).ai_paused ?? false
    let nextEnabled: boolean
    if (action === 'enable') nextEnabled = true
    else if (action === 'disable') nextEnabled = false
    else if (action === 'toggle') nextEnabled = currentlyPaused
    else {
      return NextResponse.json(
        { error: 'Ação inválida. Use: enable, disable ou toggle' },
        { status: 400 },
      )
    }

    const update = nextEnabled
      ? {
          ai_paused: false,
          ai_paused_until: null,
          ai_paused_reason: null,
          ai_paused_by_user_id: null,
        }
      : {
          ai_paused: true,
          ai_paused_until: null,
          ai_paused_reason: reason || 'manual_pause',
        }

    const { data: updated, error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(update)
      .eq('id', conversationId)
      .select('id, ai_paused, ai_agent_id, ai_paused_until, ai_paused_reason, ai_paused_by_user_id')
      .single()
    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'falha ao atualizar' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      ...toExternalShape(updated as ConversationAIRow),
      message: nextEnabled
        ? 'IA ativada para esta conversa'
        : 'IA pausada para esta conversa',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
