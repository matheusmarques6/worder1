import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()
    const { tag, action } = body

    if (!tag) {
      return NextResponse.json({ error: 'tag required' }, { status: 400 })
    }

    // Buscar contato atual
    const { data: contact, error: fetchError } = await supabase
      .from('whatsapp_contacts')
      .select('tags')
      .eq('id', contactId)
      .single()

    if (fetchError) throw fetchError

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
      .from('whatsapp_contacts')
      .update({ tags: newTags, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ contact: updatedContact })
  } catch (error: any) {
    console.error('Error updating tags:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
