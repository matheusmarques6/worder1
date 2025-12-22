// =============================================
// API: WhatsApp Cloud - Conversations
// src/app/api/whatsapp/cloud/conversations/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =============================================
// GET - Listar conversas
// =============================================
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const status = searchParams.get('status'); // open, closed, all
    const assignedTo = searchParams.get('assignedTo');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Query base
    let query = supabase
      .from('whatsapp_cloud_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(id, name, phone_number, profile_picture),
        account:whatsapp_business_accounts(id, display_phone_number, verified_name)
      `)
      .eq('organization_id', profile.organization_id);

    // Filtros
    if (accountId) {
      query = query.eq('waba_id', accountId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (assignedTo) {
      if (assignedTo === 'me') {
        query = query.eq('assigned_to', user.id);
      } else if (assignedTo === 'unassigned') {
        query = query.is('assigned_to', null);
      } else {
        query = query.eq('assigned_to', assignedTo);
      }
    }

    if (search) {
      query = query.or(`contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%`);
    }

    // Ordenar e paginar
    query = query
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data: conversations, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Contar totais
    const { count: totalCount } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id);

    const { count: unreadCount } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .gt('unread_count', 0);

    return NextResponse.json({
      conversations: conversations || [],
      pagination: {
        limit,
        offset,
        total: totalCount || 0,
        hasMore: (conversations?.length || 0) === limit,
      },
      stats: {
        total: totalCount || 0,
        unread: unreadCount || 0,
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// POST - Criar nova conversa (iniciar contato)
// =============================================
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const { accountId, phoneNumber, contactName } = body;

    if (!accountId || !phoneNumber) {
      return NextResponse.json({ 
        error: 'Missing required fields: accountId, phoneNumber' 
      }, { status: 400 });
    }

    // Normalizar telefone
    let normalizedPhone = phoneNumber.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = normalizedPhone.substring(1);
    }
    if (normalizedPhone.length === 10 || normalizedPhone.length === 11) {
      normalizedPhone = '55' + normalizedPhone;
    }

    // Buscar conta
    const { data: account } = await supabase
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Verificar se já existe conversa
    const { data: existing } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('*')
      .eq('waba_id', account.id)
      .eq('wa_id', normalizedPhone)
      .single();

    if (existing) {
      return NextResponse.json({ 
        conversation: existing,
        isNew: false,
      });
    }

    // Criar ou buscar contato
    let { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('phone_number', normalizedPhone)
      .single();

    if (!contact) {
      const { data: newContact } = await supabase
        .from('whatsapp_contacts')
        .insert({
          organization_id: profile.organization_id,
          phone_number: normalizedPhone,
          name: contactName || normalizedPhone,
          source: 'whatsapp_cloud',
        })
        .select()
        .single();
      contact = newContact;
    }

    // Criar conversa
    const { data: conversation } = await supabase
      .from('whatsapp_cloud_conversations')
      .insert({
        organization_id: profile.organization_id,
        waba_id: account.id,
        contact_id: contact?.id,
        wa_id: normalizedPhone,
        chat_id: `${account.phone_number}-${normalizedPhone}`,
        contact_name: contactName || contact?.name || normalizedPhone,
        contact_phone: normalizedPhone,
        status: 'open',
        is_window_open: false, // Precisa enviar template primeiro
      })
      .select()
      .single();

    return NextResponse.json({ 
      conversation,
      contact,
      isNew: true,
      note: 'Conversation created. Send a template message to initiate contact.',
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// PATCH - Atualizar conversa (status, atribuição, etc)
// =============================================
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const { 
      conversationId,
      status,
      assignedTo,
      labels,
      markAsRead,
    } = body;

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    // Buscar conversa
    const { data: conversation } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('*, account:whatsapp_business_accounts(*)')
      .eq('id', conversationId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Preparar update
    const updates: any = { updated_at: new Date().toISOString() };

    if (status) {
      updates.status = status;
    }

    if (assignedTo !== undefined) {
      updates.assigned_to = assignedTo || null;
    }

    if (labels !== undefined) {
      updates.labels = labels;
    }

    if (markAsRead) {
      updates.unread_count = 0;

      // Marcar como lido na API do WhatsApp
      if (conversation.account?.access_token) {
        try {
          // Buscar última mensagem recebida
          const { data: lastMessage } = await supabase
            .from('whatsapp_cloud_messages')
            .select('message_id')
            .eq('conversation_id', conversationId)
            .eq('direction', 'inbound')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

          if (lastMessage?.message_id) {
            const client = createWhatsAppCloudClient({
              phoneNumberId: conversation.account.phone_number_id,
              accessToken: conversation.account.access_token,
            });
            await client.markAsRead(lastMessage.message_id);
          }
        } catch (markError) {
          console.error('Error marking as read:', markError);
        }
      }
    }

    // Atualizar
    const { data: updated, error } = await supabase
      .from('whatsapp_cloud_conversations')
      .update(updates)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ conversation: updated });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
