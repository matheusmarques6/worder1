import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// GET - Buscar contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id

    const { data: contact, error } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (error) throw error

    // Buscar notas do contato
    const { data: notes } = await supabase
      .from('whatsapp_contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })

    // Contar mensagens
    const { count: messagesReceived } = await supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('contact_id', contactId)
      .eq('direction', 'inbound')

    const { count: messagesSent } = await supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('contact_id', contactId)
      .eq('direction', 'outbound')

    const formattedContact = {
      id: contact.id,
      organization_id: contact.organization_id,
      phone_number: contact.phone_number,
      name: contact.name || contact.profile_name,
      email: contact.email,
      profile_picture_url: contact.profile_picture_url,
      address: contact.address || {},
      tags: contact.tags || [],
      total_orders: contact.total_orders || 0,
      total_spent: contact.total_spent || 0,
      is_blocked: contact.is_blocked || false,
      total_messages_received: messagesReceived || 0,
      total_messages_sent: messagesSent || 0,
      created_at: contact.created_at,
    }

    return NextResponse.json({ 
      contact: formattedContact,
      notes: notes || [],
    })
  } catch (error: any) {
    console.error('Error fetching contact:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Atualizar contato
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()

    const { data, error } = await supabase
      .from('whatsapp_contacts')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ contact: data })
  } catch (error: any) {
    console.error('Error updating contact:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
