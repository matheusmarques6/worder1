import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()
    const { content } = body

    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }

    const { data: note, error } = await supabase
      .from('whatsapp_contact_notes')
      .insert({
        contact_id: contactId,
        content: content.trim(),
        created_by_name: 'Usuário',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ note })
  } catch (error: any) {
    console.error('Error adding note:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
