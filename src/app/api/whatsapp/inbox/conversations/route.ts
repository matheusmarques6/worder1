// src/app/api/whatsapp/inbox/conversations/route.ts
// CORRIGIDO: Usa unified_contact_id para buscar da tabela CONTACTS
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

    // CORREÇÃO: Buscar conversas com contato UNIFICADO
    let query = supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        unified_contact:contacts!unified_contact_id(
          id,
          full_name,
          first_name,
          last_name,
          whatsapp,
          phone,
          email,
          profile_picture_url,
          avatar_url,
          tags,
          total_orders,
          total_spent,
          is_blocked,
          company,
          position,
          created_at
        ),
        legacy_contact:whatsapp_contacts(
          id,
          name,
          profile_name,
          phone_number,
          email,
          profile_picture_url,
          tags,
          total_orders,
          total_spent,
          is_blocked,
          created_at
        )
      `)
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Conversations query error:', error)
      
      // Fallback: query simples sem joins se der erro
      const { data: simpleData, error: simpleError } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false })

      if (simpleError) throw simpleError

      const conversations = (simpleData || []).map(conv => formatConversation(conv, null, null))
      return NextResponse.json({ conversations })
    }

    // Formatar para o frontend com fallbacks robustos
    const conversations = (data || []).map(conv => {
      return formatConversation(conv, conv.unified_contact, conv.legacy_contact)
    })

    // Filtrar por busca se necessário
    let filteredConversations = conversations
    if (search) {
      const searchLower = search.toLowerCase()
      filteredConversations = conversations.filter(conv => 
        conv.contact_name?.toLowerCase().includes(searchLower) ||
        conv.phone_number?.includes(search)
      )
    }

    return NextResponse.json({ conversations: filteredConversations })
  } catch (error: any) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper para formatar conversa
function formatConversation(conv: any, unifiedContact: any, legacyContact: any) {
  // Priorizar contato unificado, fallback para legado
  const contact = unifiedContact || legacyContact
  
  // Phone number
  const phoneNumber = conv.phone_number || conv.contact_phone || 
                     contact?.whatsapp || contact?.phone || contact?.phone_number || ''
  
  // Nome do contato
  const contactName = contact?.full_name || 
                     contact?.first_name ||
                     contact?.name || 
                     contact?.profile_name || 
                     conv.contact_name ||
                     phoneNumber
  
  // Avatar
  const contactAvatar = contact?.profile_picture_url || 
                       contact?.avatar_url || 
                       conv.contact_avatar

  return {
    id: conv.id,
    organization_id: conv.organization_id,
    instance_id: conv.instance_id,
    
    // IMPORTANTE: Retornar o ID do contato UNIFICADO se disponível
    contact_id: conv.unified_contact_id || conv.contact_id || contact?.id,
    unified_contact_id: conv.unified_contact_id,
    legacy_contact_id: conv.contact_id,
    
    phone_number: phoneNumber,
    chat_id: conv.chat_id,
    status: conv.status || 'open',
    
    // Bot/IA - usar ai_enabled com fallback
    is_bot_active: conv.ai_enabled ?? conv.is_bot_active ?? true,
    ai_enabled: conv.ai_enabled ?? true,
    ai_agent_id: conv.ai_agent_id,
    
    // Mensagens
    last_message_at: conv.last_message_at,
    last_message_preview: conv.last_message_preview,
    last_message_direction: conv.last_message_direction,
    unread_count: conv.unread_count || 0,
    
    // Window
    is_window_open: conv.is_window_open ?? true,
    window_expires_at: conv.window_expires_at,
    last_customer_message_at: conv.last_customer_message_at,
    
    // Atribuição - usar assigned_to
    assigned_to: conv.assigned_to,
    assigned_agent_id: conv.assigned_to, // compatibilidade
    
    // Labels/Priority
    labels: conv.labels || [],
    priority: conv.priority || 'normal',
    
    // Dados do contato
    contact_name: contactName,
    contact_avatar: contactAvatar,
    contact_tags: contact?.tags || [],
    contact_email: contact?.email,
    contact_total_orders: contact?.total_orders || 0,
    contact_total_spent: parseFloat(contact?.total_spent) || 0,
    contact_is_blocked: contact?.is_blocked || false,
    contact_company: contact?.company,
    contact_position: contact?.position,
    
    // Datas
    created_at: conv.created_at,
    updated_at: conv.updated_at,
  }
}
