import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/whatsapp/inbox/conversations/[id]/assign
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { agentId, assignedBy } = body

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        assigned_agent_id: agentId || null,
        assigned_at: agentId ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*, contact:whatsapp_contacts(id, organization_id)')
      .single()

    if (error) throw error

    // Registra atividade
    if (data?.contact) {
      await supabase.from('whatsapp_contact_activities').insert({
        organization_id: data.contact.organization_id,
        contact_id: data.contact.id,
        conversation_id: id,
        activity_type: 'agent_assigned',
        title: agentId ? 'Conversa atribuída a agente' : 'Atribuição removida',
        metadata: { agent_id: agentId },
        created_by: assignedBy
      })
    }

    return NextResponse.json({ conversation: data })

  } catch (error) {
    console.error('Error assigning conversation:', error)
    return NextResponse.json({ error: 'Failed to assign conversation' }, { status: 500 })
  }
}
