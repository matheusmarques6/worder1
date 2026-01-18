// src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// POST - Atribuir ou remover atribuição de conversa
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id
    const body = await request.json()
    const { userId } = body // null para remover atribuição

    // Preparar dados de atualização
    const updateData: Record<string, any> = {
      assigned_agent_id: userId || null,
      updated_at: new Date().toISOString()
    }

    if (userId) {
      updateData.assigned_at = new Date().toISOString()
    } else {
      updateData.assigned_at = null
    }

    // Atualizar conversa
    const { data: updatedConversation, error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select('id, assigned_agent_id, assigned_at')
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ 
      success: true,
      conversation: updatedConversation 
    })
  } catch (error) {
    console.error('Error assigning conversation:', error)
    return NextResponse.json(
      { error: 'Failed to assign conversation' },
      { status: 500 }
    )
  }
}
