// src/app/api/whatsapp/inbox/conversations/[id]/bot/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET - Buscar status do bot
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const conversationId = params.id
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select(`
        id,
        is_bot_active,
        bot_disabled_until,
        bot_disabled_reason,
        bot_disabled_by,
        ai_enabled,
        ai_agent_id,
        ai_disabled_at,
        ai_disabled_reason
      `)
      .eq('id', conversationId)
      .single()

    if (error || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Buscar agente de IA se existir
    let aiAgent = null
    if (conversation.ai_agent_id) {
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('id, name, is_active')
        .eq('id', conversation.ai_agent_id)
        .single()
      aiAgent = agent
    }

    return NextResponse.json({
      is_bot_active: conversation.is_bot_active,
      bot_disabled_until: conversation.bot_disabled_until,
      bot_disabled_reason: conversation.bot_disabled_reason,
      ai_enabled: conversation.ai_enabled,
      ai_agent_id: conversation.ai_agent_id,
      ai_agent: aiAgent
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
    const supabase = await createClient()
    const conversationId = params.id
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      is_bot_active, 
      ai_enabled,
      ai_agent_id,
      disable_for_minutes, // Tempo para desabilitar temporariamente
      reason 
    } = body

    // Buscar conversa atual
    const { data: conversation, error: fetchError } = await supabase
      .from('whatsapp_conversations')
      .select('id, organization_id, contact_id, is_bot_active, ai_enabled, ai_agent_id')
      .eq('id', conversationId)
      .single()

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Preparar dados de atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // Toggle do bot (compatibilidade com sistema antigo)
    if (is_bot_active !== undefined) {
      updateData.is_bot_active = is_bot_active
      
      if (!is_bot_active) {
        updateData.bot_disabled_by = user.id
        updateData.bot_disabled_reason = reason || 'Desativado manualmente'
        
        if (disable_for_minutes) {
          const disabledUntil = new Date()
          disabledUntil.setMinutes(disabledUntil.getMinutes() + disable_for_minutes)
          updateData.bot_disabled_until = disabledUntil.toISOString()
        } else {
          updateData.bot_disabled_until = null
        }
      } else {
        updateData.bot_disabled_by = null
        updateData.bot_disabled_reason = null
        updateData.bot_disabled_until = null
      }
    }

    // Toggle da IA (novo sistema de agentes)
    if (ai_enabled !== undefined) {
      updateData.ai_enabled = ai_enabled
      
      if (!ai_enabled) {
        updateData.ai_disabled_at = new Date().toISOString()
        updateData.ai_disabled_reason = reason || 'Desativado manualmente'
      } else {
        updateData.ai_disabled_at = null
        updateData.ai_disabled_reason = null
      }
    }

    // Definir agente de IA
    if (ai_agent_id !== undefined) {
      updateData.ai_agent_id = ai_agent_id
      
      // Se definir um agente, ativar IA automaticamente
      if (ai_agent_id) {
        updateData.ai_enabled = true
        updateData.ai_disabled_at = null
        updateData.ai_disabled_reason = null
      }
    }

    // Atualizar conversa
    const { data: updatedConversation, error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select(`
        id,
        is_bot_active,
        bot_disabled_until,
        bot_disabled_reason,
        ai_enabled,
        ai_agent_id
      `)
      .single()

    if (updateError) {
      throw updateError
    }

    // Registrar atividade
    const activityType = is_bot_active !== undefined 
      ? (is_bot_active ? 'bot_enabled' : 'bot_disabled')
      : 'bot_interaction'
    
    await supabase.from('contact_activities').insert({
      contact_id: conversation.contact_id,
      conversation_id: conversationId,
      organization_id: conversation.organization_id,
      activity_type: activityType,
      title: is_bot_active !== undefined 
        ? (is_bot_active ? 'Bot ativado' : 'Bot desativado')
        : 'Configuração de IA alterada',
      description: reason || null,
      created_by: user.id,
      metadata: {
        is_bot_active: updateData.is_bot_active,
        ai_enabled: updateData.ai_enabled,
        ai_agent_id: updateData.ai_agent_id,
        disable_for_minutes
      }
    }).single()

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
