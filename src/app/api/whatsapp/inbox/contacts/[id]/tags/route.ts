// src/app/api/whatsapp/inbox/contacts/[id]/tags/route.ts
// CORRIGIDO: Usa tabela CONTACTS unificada
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// POST - Adicionar ou remover tag
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()
    const { tag, action } = body // action: 'add' | 'remove'

    if (!tag || !action) {
      return NextResponse.json(
        { error: 'tag and action required' },
        { status: 400 }
      )
    }

    // Buscar contato da tabela UNIFICADA (contacts)
    let contact = null
    let tableName = 'contacts'

    const { data: unifiedContact, error: unifiedError } = await supabase
      .from('contacts')
      .select('id, tags, organization_id')
      .eq('id', contactId)
      .single()

    if (unifiedContact) {
      contact = unifiedContact
    } else {
      // Fallback: tentar whatsapp_contacts
      const { data: waContact, error: waError } = await supabase
        .from('whatsapp_contacts')
        .select('id, tags, organization_id')
        .eq('id', contactId)
        .single()

      if (waContact) {
        contact = waContact
        tableName = 'whatsapp_contacts'
      }
    }

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    let newTags = contact.tags || []

    if (action === 'add') {
      if (!newTags.includes(tag)) {
        newTags = [...newTags, tag]
      }
    } else if (action === 'remove') {
      newTags = newTags.filter((t: string) => t !== tag)
    }

    // Atualizar contato na tabela correta
    const { data: updatedContact, error: updateError } = await supabase
      .from(tableName)
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
