// src/app/api/whatsapp/inbox/contacts/[id]/tags/route.ts
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

    // Buscar contato atual
    const { data: contact, error: fetchError } = await supabase
      .from('contacts')
      .select('id, tags, organization_id')
      .eq('id', contactId)
      .single()

    if (fetchError || !contact) {
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
