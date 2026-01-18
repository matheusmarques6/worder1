// src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts
// CORRIGIDO: Usa coluna assigned_to correta
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
    // CORREÇÃO: Coluna correta é 'assigned_to', não 'assigned_agent_id'
    const updateData: Record<string, any> = {
      assigned_to: userId || null,
      updated_at: new Date().toISOString()
    }

    // Atualizar conversa
    const { data: updatedConversation, error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select('id, assigned_to, status')
      .single()

    if (updateError) {
      console.error('Error updating conversation:', updateError)
      throw updateError
    }

    // Registrar atividade
    if (userId) {
      // Buscar nome do agente
      const { data: agent } = await supabase
        .from('profiles')
        .select('full_name, first_name')
        .eq('id', userId)
        .single()

      const agentName = agent?.full_name || agent?.first_name || 'Agente'

      // Buscar conversa para pegar contact_id
      const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('unified_contact_id, contact_id')
        .eq('id', conversationId)
        .single()

      const contactId = conversation?.unified_contact_id || conversation?.contact_id

      if (contactId) {
        await supabase
          .from('contact_activities')
          .insert({
            organization_id: (await supabase
              .from('whatsapp_conversations')
              .select('organization_id')
              .eq('id', conversationId)
              .single()).data?.organization_id,
            contact_id: contactId,
            conversation_id: conversationId,
            activity_type: 'conversation_assigned',
            title: 'Conversa atribuída',
            description: `Conversa atribuída para ${agentName}`,
          })
      }
    }

    return NextResponse.json({ 
      success: true,
      conversation: {
        ...updatedConversation,
        assigned_agent_id: updatedConversation.assigned_to // compatibilidade
      }
    })
  } catch (error: any) {
    console.error('Error assigning conversation:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to assign conversation' },
      { status: 500 }
    )
  }
}
