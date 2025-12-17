import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/inbox/contacts/[id]/notes
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data: notes, error } = await supabase
      .from('whatsapp_contact_notes')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ notes: notes || [] })

  } catch (error) {
    console.error('Error fetching notes:', error)
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }
}

// POST /api/whatsapp/inbox/contacts/[id]/notes
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { content, noteType = 'general', conversationId, userId, userName } = body

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    // Busca organization_id do contato
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('organization_id')
      .eq('id', id)
      .single()

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Cria nota
    const { data: note, error } = await supabase
      .from('whatsapp_contact_notes')
      .insert({
        organization_id: contact.organization_id,
        contact_id: id,
        conversation_id: conversationId,
        content,
        note_type: noteType,
        created_by: userId,
        created_by_name: userName,
        created_at: new Date().toISOString()
      })
      .select('*')
      .single()

    if (error) throw error

    // Registra atividade
    await supabase.from('whatsapp_contact_activities').insert({
      organization_id: contact.organization_id,
      contact_id: id,
      conversation_id: conversationId,
      activity_type: 'note_added',
      title: 'Nota adicionada',
      description: content.substring(0, 100),
      created_by: userId,
      created_by_name: userName
    })

    return NextResponse.json({ note })

  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}
