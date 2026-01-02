import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

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
