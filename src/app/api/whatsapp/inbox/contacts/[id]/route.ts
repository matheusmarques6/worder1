import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/inbox/contacts/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data: contact, error } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Buscar conversas do contato
    const { data: conversations } = await supabase
      .from('whatsapp_conversations')
      .select('id, status, created_at, last_message_at')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })
      .limit(5)

    // Buscar atividades recentes
    const { data: activities } = await supabase
      .from('whatsapp_contact_activities')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Buscar notas
    const { data: notes } = await supabase
      .from('whatsapp_contact_notes')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      contact,
      conversations: conversations || [],
      activities: activities || [],
      notes: notes || []
    })

  } catch (error) {
    console.error('Error fetching contact:', error)
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 })
  }
}

// PUT /api/whatsapp/inbox/contacts/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { name, email, address, customFields, tags } = body

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) updates.name = name
    if (email !== undefined) updates.email = email
    if (address !== undefined) updates.address = address
    if (customFields !== undefined) updates.custom_fields = customFields
    if (tags !== undefined) updates.tags = tags

    const { data, error } = await supabase
      .from('whatsapp_contacts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ contact: data })

  } catch (error) {
    console.error('Error updating contact:', error)
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}
