import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// POST - Ativar/desativar bot e selecionar agente
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id
    const body = await request.json()
    const { agentId, isActive, reason } = body

    // =====================================================
    // PAUSAR - Desativar IA para esta conversa
    // =====================================================
    if (isActive === false || !agentId) {
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .update({
          // AMBOS os campos para garantir pause imediato
          is_bot_active: false,
          ai_enabled: false,
          ai_agent_id: null,
          // Metadados do pause
          ai_disabled_at: new Date().toISOString(),
          ai_disabled_reason: reason || 'manually_paused',
          bot_stopped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .select()
        .single()

      if (error) throw error

      console.log(`[Bot] ⏸️ IA pausada para conversa ${conversationId}`)

      return NextResponse.json({ 
        conversation: data,
        botActive: false,
        aiEnabled: false,
        agent: null,
      })
    }

    // =====================================================
    // RETOMAR - Ativar IA com um agente específico
    // =====================================================
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        // AMBOS os campos para reativar
        is_bot_active: true,
        ai_enabled: true,
        ai_agent_id: agentId,
        // Limpar metadados de pause
        ai_disabled_at: null,
        ai_disabled_reason: null,
        bot_stopped_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .select()
      .single()

    if (error) throw error

    console.log(`[Bot] ▶️ IA ativada para conversa ${conversationId} com agente ${agent.name}`)

    return NextResponse.json({ 
      conversation: data,
      botActive: true,
      aiEnabled: true,
      agent: agent,
    })
  } catch (error: any) {
    console.error('Error toggling bot:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET - Status atual do bot
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select('*, agent:ai_agents(*)')
      .eq('id', conversationId)
      .single()

    if (error) throw error

    return NextResponse.json({ 
      botActive: conversation.is_bot_active,
      aiEnabled: conversation.ai_enabled,
      aiDisabledAt: conversation.ai_disabled_at,
      aiDisabledReason: conversation.ai_disabled_reason,
      agent: conversation.agent,
    })
  } catch (error: any) {
    console.error('Error getting bot status:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
