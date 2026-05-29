// src/app/api/whatsapp/inbox/conversations/[id]/bot/route.ts
// CORRIGIDO: Usa coluna ai_enabled correta
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
export const dynamic = 'force-dynamic';

// GET - Buscar status do bot
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select(`
        id,
        ai_enabled,
        ai_agent_id,
        ai_disabled_at,
        ai_disabled_reason
      `)
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .single()

    if (error || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json({
      // Retornar tanto ai_enabled quanto is_bot_active para compatibilidade
      ai_enabled: conversation.ai_enabled ?? true,
      is_bot_active: conversation.ai_enabled ?? true,
      ai_agent_id: conversation.ai_agent_id,
      ai_disabled_at: conversation.ai_disabled_at,
      ai_disabled_reason: conversation.ai_disabled_reason
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
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id
    const body = await request.json()
    const { 
      is_bot_active, // compatibilidade
      ai_enabled,
      ai_agent_id,
      reason 
    } = body

    // Preparar dados de atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // CORREÇÃO: Usar ai_enabled como coluna principal
    // Aceitar tanto is_bot_active quanto ai_enabled
    const newAiEnabled = ai_enabled ?? is_bot_active

    if (newAiEnabled !== undefined) {
      updateData.ai_enabled = newAiEnabled
      
      if (!newAiEnabled) {
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
      if (ai_agent_id) {
        updateData.ai_enabled = true
      }
    }

    // Atualizar conversa
    const { data: updatedConversation, error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .select('id, ai_enabled, ai_agent_id, ai_disabled_at, ai_disabled_reason')
      .single()

    if (updateError) {
      console.error('Error updating conversation:', updateError)
      throw updateError
    }

    return NextResponse.json({ 
      success: true,
      conversation: {
        ...updatedConversation,
        is_bot_active: updatedConversation.ai_enabled // compatibilidade
      }
    })
  } catch (error: any) {
    console.error('Error toggling bot:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to toggle bot' },
      { status: 500 }
    )
  }
}
