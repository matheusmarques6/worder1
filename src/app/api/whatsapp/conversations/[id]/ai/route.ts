// =====================================================
// API PARA CONTROLAR IA EM CONVERSAS
// POST /api/whatsapp/conversations/[id]/ai
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// GET - Status atual da IA
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const conversationId = params.id

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select('id, ai_enabled, ai_agent_id, ai_disabled_at, ai_disabled_reason')
      .eq('id', conversationId)
      .single()

    if (error || !conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      conversationId,
      ai_enabled: conversation.ai_enabled ?? true,
      ai_agent_id: conversation.ai_agent_id,
      ai_disabled_at: conversation.ai_disabled_at,
      ai_disabled_reason: conversation.ai_disabled_reason,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Alterar status da IA
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const conversationId = params.id
    const body = await request.json()
    
    const { action, reason } = body
    // action: 'enable' | 'disable' | 'toggle'

    // Buscar status atual
    const { data: conversation, error: fetchError } = await supabase
      .from('whatsapp_conversations')
      .select('ai_enabled')
      .eq('id', conversationId)
      .single()

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    const currentStatus = conversation.ai_enabled ?? true
    let newStatus: boolean

    // Determinar novo status
    if (action === 'enable') {
      newStatus = true
    } else if (action === 'disable') {
      newStatus = false
    } else if (action === 'toggle') {
      newStatus = !currentStatus
    } else {
      return NextResponse.json({ 
        error: 'Ação inválida. Use: enable, disable ou toggle' 
      }, { status: 400 })
    }

    // Atualizar
    if (newStatus) {
      // Habilitar IA
      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update({
          ai_enabled: true,
          ai_disabled_at: null,
          ai_disabled_reason: null,
        })
        .eq('id', conversationId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        conversationId,
        ai_enabled: true,
        message: '✅ IA ativada para esta conversa',
      })

    } else {
      // Desabilitar IA
      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update({
          ai_enabled: false,
          ai_disabled_at: new Date().toISOString(),
          ai_disabled_reason: reason || 'manual_pause',
        })
        .eq('id', conversationId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        conversationId,
        ai_enabled: false,
        message: '⏸️ IA pausada para esta conversa',
      })
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
