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
    const { block } = body

    const { data: contact, error } = await supabase
      .from('whatsapp_contacts')
      .update({ 
        is_blocked: block, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', contactId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ contact })
  } catch (error: any) {
    console.error('Error blocking contact:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
