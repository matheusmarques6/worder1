// src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST - Atribuir ou remover atribuição de conversa
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
    const { userId } = body // null para remover atribuição

    // Buscar conversa atual
    const { data: conversation, error: fetchError } = await supabase
      .from('whatsapp_conversations')
      .select('id, organization_id, contact_id, assigned_agent_id')
      .eq('id', conversationId)
      .single()

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

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
      .select(`
        id, 
        assigned_agent_id, 
        assigned_at,
        assigned_agent:users!assigned_agent_id(id, name, email)
      `)
      .single()

    if (updateError) {
      throw updateError
    }

    // Buscar nome do agente para a atividade
    let agentName = null
    if (userId) {
      const { data: agent } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .single()
      agentName = agent?.name || agent?.email
    }

    // Registrar atividade
    await supabase.from('contact_activities').insert({
      contact_id: conversation.contact_id,
      conversation_id: conversationId,
      organization_id: conversation.organization_id,
      activity_type: userId ? 'agent_assigned' : 'agent_removed',
      title: userId ? 'Conversa atribuída' : 'Atribuição removida',
      description: agentName ? `Atribuída para ${agentName}` : null,
      created_by: user.id,
      metadata: { assigned_to: userId }
    }).single()

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
