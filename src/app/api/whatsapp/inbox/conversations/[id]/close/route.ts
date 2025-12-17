import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/whatsapp/inbox/conversations/[id]/close
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { userId, resolution } = body

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        status: 'closed',
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
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
        activity_type: 'conversation_closed',
        title: 'Conversa fechada',
        description: resolution || null,
        created_by: userId
      })
    }

    return NextResponse.json({ conversation: data })

  } catch (error) {
    console.error('Error closing conversation:', error)
    return NextResponse.json({ error: 'Failed to close conversation' }, { status: 500 })
  }
}
