// src/app/api/whatsapp/inbox/conversations/[id]/bot/route.ts
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// GET - Buscar status do bot
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select(`
        id,
        is_bot_active,
        bot_disabled_until,
        bot_disabled_reason,
        ai_enabled,
        ai_agent_id
      `)
      .eq('id', conversationId)
      .single()

    if (error || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json({
      is_bot_active: conversation.is_bot_active,
      bot_disabled_until: conversation.bot_disabled_until,
      bot_disabled_reason: conversation.bot_disabled_reason,
      ai_enabled: conversation.ai_enabled,
      ai_agent_id: conversation.ai_agent_id
    })
  } catch (error) {
    console.error('Error fetching bot status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bot status' },
      { status: 500 }
    )
  }
}

// POST - Toggle bot/IA
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id
    const body = await request.json()
    const { 
      is_bot_active, 
      ai_enabled,
      ai_agent_id,
      reason 
    } = body

    // Preparar dados de atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // Toggle do bot
    if (is_bot_active !== undefined) {
      updateData.is_bot_active = is_bot_active
      
      if (!is_bot_active) {
        updateData.bot_disabled_reason = reason || 'Desativado manualmente'
      } else {
        updateData.bot_disabled_reason = null
        updateData.bot_disabled_until = null
      }
    }

    // Toggle da IA
    if (ai_enabled !== undefined) {
      updateData.ai_enabled = ai_enabled
    }

    // Definir agente de IA
    if (ai_agent_id !== undefined) {
      updateData.ai_agent_id = ai_agent_id
      if (ai_agent_id) {
        updateData.ai_enabled = true
      }
    }

    // Atualizar conversa
    const { data: updatedConversation, error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select('id, is_bot_active, bot_disabled_until, bot_disabled_reason, ai_enabled, ai_agent_id')
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ 
      success: true,
      conversation: updatedConversation 
    })
  } catch (error) {
    console.error('Error toggling bot:', error)
    return NextResponse.json(
      { error: 'Failed to toggle bot' },
      { status: 500 }
    )
  }
}
