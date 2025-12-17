import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/whatsapp/inbox/contacts/[id]/block
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { block, reason, userId } = body // block: true | false

    const updates: any = {
      is_blocked: block,
      updated_at: new Date().toISOString()
    }

    if (block) {
      updates.blocked_reason = reason || 'Bloqueado pelo usuário'
      updates.blocked_at = new Date().toISOString()
    } else {
      updates.blocked_reason = null
      updates.blocked_at = null
    }

    // Busca organization_id
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('organization_id')
      .eq('id', id)
      .single()

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('whatsapp_contacts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    // Registra atividade
    await supabase.from('whatsapp_contact_activities').insert({
      organization_id: contact.organization_id,
      contact_id: id,
      activity_type: block ? 'blocked' : 'unblocked',
      title: block ? 'Contato bloqueado' : 'Contato desbloqueado',
      description: reason,
      created_by: userId
    })

    // Se bloqueado, desativa bot em todas as conversas
    if (block) {
      await supabase
        .from('whatsapp_conversations')
        .update({ is_bot_active: false, bot_disabled_reason: 'Contato bloqueado' })
        .eq('contact_id', id)
    }

    return NextResponse.json({ contact: data })

  } catch (error) {
    console.error('Error blocking contact:', error)
    return NextResponse.json({ error: 'Failed to block contact' }, { status: 500 })
  }
}
