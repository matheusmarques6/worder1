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
        contact:whatsapp_contacts(
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

    if (error) throw error

    // Formatar para o frontend com fallbacks robustos
    const conversations = (data || []).map(conv => {
      // CORREÇÃO: Usar phone_number ou contact_phone como fallback
      const phoneNumber = conv.phone_number || conv.contact_phone || '';
      
      // Nome do contato: priorizar dados do contato vinculado
      const contactName = conv.contact?.name || 
                         conv.contact?.profile_name || 
                         conv.contact_name || // fallback para campo inline
                         phoneNumber;
      
      return {
        id: conv.id,
        organization_id: conv.organization_id,
        contact_id: conv.contact_id || conv.contact?.id, // Garantir que contact_id está presente
        phone_number: phoneNumber,
        status: conv.status || 'open',
        is_bot_active: conv.is_bot_active ?? true,
        ai_enabled: conv.ai_enabled,
        ai_agent_id: conv.ai_agent_id,
        last_message_at: conv.last_message_at,
        last_message_preview: conv.last_message_preview,
        unread_count: conv.unread_count || 0,
        can_send_template_only: conv.can_send_template_only || false,
        
        // Dados do contato (com fallbacks)
        contact_name: contactName,
        contact_avatar: conv.contact?.profile_picture_url || conv.contact_avatar,
        contact_tags: conv.contact?.tags || conv.tags || [],
        
        // Dados extras do contato para o painel
        contact_email: conv.contact?.email,
        contact_total_orders: conv.contact?.total_orders || 0,
        contact_total_spent: conv.contact?.total_spent || 0,
        contact_is_blocked: conv.contact?.is_blocked || false,
      };
    });

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
