import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/whatsapp/inbox/conversations/[id]/bot
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { isActive, reason, userId } = body

    const updates: any = {
      is_bot_active: isActive,
      updated_at: new Date().toISOString()
    }

    if (!isActive) {
      updates.bot_disabled_reason = reason || 'Desativado manualmente'
      updates.bot_disabled_by = userId
    } else {
      updates.bot_disabled_reason = null
      updates.bot_disabled_by = null
      updates.bot_disabled_until = null
    }

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update(updates)
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
        activity_type: isActive ? 'bot_enabled' : 'bot_disabled',
        title: isActive ? 'Bot ativado' : 'Bot desativado',
        description: reason || null,
        created_by: userId
      })
    }

    return NextResponse.json({ conversation: data })

  } catch (error) {
    console.error('Error toggling bot:', error)
    return NextResponse.json({ error: 'Failed to toggle bot' }, { status: 500 })
  }
}
