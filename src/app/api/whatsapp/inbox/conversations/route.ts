// Forçar rota dinâmica
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    let query = supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(*)
      `)
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error

    // Formatar para o frontend
    const conversations = (data || []).map(conv => ({
      id: conv.id,
      organization_id: conv.organization_id,
      contact_id: conv.contact_id,
      phone_number: conv.phone_number,
      status: conv.status,
      is_bot_active: conv.is_bot_active,
      last_message_at: conv.last_message_at,
      last_message_preview: conv.last_message_preview,
      unread_count: conv.unread_count || 0,
      can_send_template_only: false,
      contact_name: conv.contact?.name || conv.contact?.profile_name || conv.phone_number,
      contact_avatar: conv.contact?.profile_picture_url,
      contact_tags: conv.contact?.tags || [],
    }))

    // Filtrar por busca se necessário
    let filtered = conversations
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = conversations.filter(c => 
        c.contact_name?.toLowerCase().includes(searchLower) ||
        c.phone_number?.includes(search)
      )
    }

    return NextResponse.json({ conversations: filtered })
  } catch (error: any) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
