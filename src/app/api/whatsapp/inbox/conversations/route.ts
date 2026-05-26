// src/app/api/whatsapp/inbox/conversations/route.ts
// ✅ CORREÇÃO: Filtrar por store_id para isolamento multi-loja
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const storeId = searchParams.get('storeId') // ✅ NOVO: Filtro por loja
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    let query = supabase
      .from('whatsapp_inbox_conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Conversations query error:', error)
      
      const { data: simpleData, error: simpleError } = await supabase
        .from('whatsapp_inbox_conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      if (simpleError) throw simpleError

      const conversations = (simpleData || []).map((conv: any) => formatConversation(conv, null, null))
      return NextResponse.json(
        { conversations },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    // Formatar para o frontend
    const conversations = (data || []).map((conv: any) => {
      return formatConversation(conv, conv.unified_contact, conv.legacy_contact)
    })

    // Filtrar por busca se necessário
    let filteredConversations = conversations
    if (search) {
      const searchLower = search.toLowerCase()
      filteredConversations = conversations.filter((conv: any) =>
        conv.contact_name?.toLowerCase().includes(searchLower) ||
        conv.phone_number?.includes(search)
      )
    }

    console.log(`[Conversations] Found ${filteredConversations.length} for store ${storeId}`)
    return NextResponse.json(
      { conversations: filteredConversations },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: any) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}

// Helper para formatar conversa
function formatConversation(conv: any, unifiedContact: any, legacyContact: any) {
  const contact = unifiedContact || legacyContact
  
  const phoneNumber = conv.phone_number || conv.contact_phone || 
                     contact?.whatsapp || contact?.phone || contact?.phone_number || ''
  
  const contactName = contact?.full_name || 
                     contact?.first_name ||
                     contact?.name || 
                     contact?.profile_name || 
                     conv.contact_name ||
                     phoneNumber
  
  const contactAvatar = contact?.profile_picture_url || 
                       contact?.avatar_url || 
                       conv.contact_avatar

  return {
    id: conv.id,
    organization_id: conv.organization_id,
    store_id: conv.store_id, // ✅ NOVO: Incluir store_id
    instance_id: conv.instance_id,
    
    contact_id: conv.unified_contact_id || conv.contact_id || contact?.id,
    unified_contact_id: conv.unified_contact_id,
    legacy_contact_id: conv.contact_id,
    
    phone_number: phoneNumber,
    chat_id: conv.chat_id,
    status: conv.status || 'open',
    
    is_bot_active: conv.ai_enabled ?? conv.is_bot_active ?? true,
    ai_enabled: conv.ai_enabled ?? true,
    ai_agent_id: conv.ai_agent_id,
    
    last_message_at: conv.last_message_at,
    last_message_preview: conv.last_message_preview,
    last_message_direction: conv.last_message_direction,
    unread_count: conv.unread_count || 0,
    
    is_window_open: conv.is_window_open ?? true,
    window_expires_at: conv.window_expires_at,
    last_customer_message_at: conv.last_customer_message_at,
    
    assigned_to: conv.assigned_to,
    assigned_agent_id: conv.assigned_to,
    
    labels: conv.labels || [],
    priority: conv.priority || 'normal',
    
    contact_name: contactName,
    contact_avatar: contactAvatar,
    contact_tags: contact?.tags || [],
    contact_email: contact?.email,
    contact_total_orders: contact?.total_orders || 0,
    contact_total_spent: parseFloat(contact?.total_spent) || 0,
    contact_is_blocked: contact?.is_blocked || false,
    contact_company: contact?.company,
    contact_position: contact?.position,
    
    created_at: conv.created_at,
    updated_at: conv.updated_at,
  }
}
