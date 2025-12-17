import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/whatsapp/inbox/contacts/[id]/tags
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { tag, action, userId } = body // action: 'add' | 'remove'

    if (!tag || !action) {
      return NextResponse.json({ error: 'Tag and action required' }, { status: 400 })
    }

    // Busca contato atual
    const { data: contact, error: fetchError } = await supabase
      .from('whatsapp_contacts')
      .select('tags, organization_id')
      .eq('id', id)
      .single()

    if (fetchError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    let newTags = contact.tags || []

    if (action === 'add') {
      if (!newTags.includes(tag)) {
        newTags.push(tag)
      }
    } else if (action === 'remove') {
      newTags = newTags.filter((t: string) => t !== tag)
    }

    // Atualiza tags
    const { data, error } = await supabase
      .from('whatsapp_contacts')
      .update({ 
        tags: newTags,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    // Registra atividade
    await supabase.from('whatsapp_contact_activities').insert({
      organization_id: contact.organization_id,
      contact_id: id,
      activity_type: action === 'add' ? 'tag_added' : 'tag_removed',
      title: action === 'add' ? `Tag "${tag}" adicionada` : `Tag "${tag}" removida`,
      metadata: { tag },
      created_by: userId
    })

    return NextResponse.json({ contact: data })

  } catch (error) {
    console.error('Error updating tags:', error)
    return NextResponse.json({ error: 'Failed to update tags' }, { status: 500 })
  }
}
