// src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts
// Atribui na tabela base correta (cloud ou legacy) — ambas tem assigned_to.
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { resolveInboxConversation } from '@/lib/whatsapp/inbox-conversation-resolver'
export const dynamic = 'force-dynamic';

// POST - Atribuir ou remover atribuição de conversa
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
    const { userId } = body // null para remover atribuição

    const resolved = await resolveInboxConversation(supabase, conversationId, orgId)
    if (!resolved) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const updateData: Record<string, any> = {
      assigned_to: userId || null,
      updated_at: new Date().toISOString()
    }

    const { data: updatedConversation, error: updateError } = await supabase
      .from(resolved.table)
      .update(updateData)
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .select('id, assigned_to, status')
      .single()

    if (updateError) {
      console.error('Error updating conversation:', updateError)
      throw updateError
    }

    // Registrar atividade
    if (userId) {
      const { data: agent } = await supabase
        .from('profiles')
        .select('full_name, first_name')
        .eq('id', userId)
        .single()

      const agentName = agent?.full_name || agent?.first_name || 'Agente'
      const contactId = resolved.row.unified_contact_id || resolved.row.contact_id

      if (contactId) {
        await supabase
          .from('contact_activities')
          .insert({
            organization_id: orgId,
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
