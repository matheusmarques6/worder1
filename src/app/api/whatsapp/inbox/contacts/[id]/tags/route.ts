// src/app/api/whatsapp/inbox/contacts/[id]/tags/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST - Adicionar ou remover tag
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const contactId = params.id
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tag, action } = body // action: 'add' | 'remove'

    if (!tag || !action) {
      return NextResponse.json(
        { error: 'tag and action required' },
        { status: 400 }
      )
    }

    // Buscar contato atual
    const { data: contact, error: fetchError } = await supabase
      .from('contacts')
      .select('id, tags')
      .eq('id', contactId)
      .single()

    if (fetchError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    let newTags = contact.tags || []

    if (action === 'add') {
      // Adicionar tag se não existir
      if (!newTags.includes(tag)) {
        newTags = [...newTags, tag]
      }
    } else if (action === 'remove') {
      // Remover tag
      newTags = newTags.filter((t: string) => t !== tag)
    }

    // Atualizar contato
    const { data: updatedContact, error: updateError } = await supabase
      .from('contacts')
      .update({ 
        tags: newTags,
        updated_at: new Date().toISOString()
      })
      .eq('id', contactId)
      .select('id, tags')
      .single()

    if (updateError) {
      throw updateError
    }

    // Registrar atividade
    await supabase.from('contact_activities').insert({
      contact_id: contactId,
      organization_id: contact.organization_id || user.user_metadata?.organization_id,
      activity_type: action === 'add' ? 'tag_added' : 'tag_removed',
      title: action === 'add' ? 'Tag adicionada' : 'Tag removida',
      description: tag,
      created_by: user.id,
    }).single()

    return NextResponse.json({ 
      success: true,
      contact: updatedContact 
    })
  } catch (error) {
    console.error('Error updating tags:', error)
    return NextResponse.json(
      { error: 'Failed to update tags' },
      { status: 500 }
    )
  }
}
