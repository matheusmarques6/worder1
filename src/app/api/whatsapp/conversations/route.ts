import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase-route';

import { getSupabaseClient } from '@/lib/api-utils';

// Helper para obter organization_id do usuário
async function getOrgIdFromSession(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { orgId: null, user: null };
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
    
  return { orgId: profile?.organization_id, user };
}

// GET - Lista conversas
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Tentar pegar organization_id da query string primeiro
    const orgIdFromQuery = searchParams.get('organization_id') || searchParams.get('organizationId');
    const agentIdFromQuery = searchParams.get('agent_id');
    
    let supabase: any;
    let orgId: string | null = null;
    let currentUser: any = null;
    
    if (orgIdFromQuery) {
      // Usar client direto se organization_id foi fornecido
      supabase = getSupabaseClient();
      if (!supabase) {
        return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
      }
      orgId = orgIdFromQuery;
    } else {
      // Fallback para autenticação por sessão
      supabase = createSupabaseRouteClient();
      const result = await getOrgIdFromSession(supabase);
      orgId = result.orgId;
      currentUser = result.user;
    }
    
    if (!orgId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const agentId = searchParams.get('agent_id');
    const whatsappNumberId = searchParams.get('whatsapp_number_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:contacts(*),
        assigned_agent:whatsapp_agents(id, name, email, avatar_url),
        tags:whatsapp_conversation_tags(
          tag:whatsapp_chat_tags(id, title, color)
        ),
        whatsapp_account:whatsapp_accounts(id, phone_number, display_name)
      `, { count: 'exact' })
      .eq('organization_id', orgId)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (agentId) {
      query = query.eq('assigned_agent_id', agentId);
    }
    
    // Filtrar por número WhatsApp específico
    if (whatsappNumberId) {
      query = query.eq('whatsapp_number_id', whatsappNumberId);
    }

    if (search) {
      query = query.or(`phone_number.ilike.%${search}%,contact_name.ilike.%${search}%`);
    }

    // Se é um agente, filtrar por números permitidos
    if (agentIdFromQuery) {
      // Buscar permissões do agente
      const { data: permissions } = await supabase
        .from('agent_permissions')
        .select('whatsapp_access_all, whatsapp_number_ids')
        .eq('agent_id', agentIdFromQuery)
        .single();
      
      if (permissions && !permissions.whatsapp_access_all && permissions.whatsapp_number_ids?.length > 0) {
        // Filtrar por números permitidos
        query = query.in('whatsapp_number_id', permissions.whatsapp_number_ids);
      } else if (permissions && !permissions.whatsapp_access_all && (!permissions.whatsapp_number_ids || permissions.whatsapp_number_ids.length === 0)) {
        // Agente sem números permitidos - retornar vazio
        return NextResponse.json({
          conversations: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching conversations:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      conversations: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('Conversations GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar nova conversa
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const { orgId } = await getOrgIdFromSession(supabase);
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { phone_number, contact_name, contact_id, origin = 'meta' } = body;

    if (!phone_number) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Normalizar número
    const normalizedPhone = phone_number.replace(/\D/g, '');

    // Verificar se já existe
    const { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('organization_id', orgId)
      .eq('phone_number', normalizedPhone)
      .single();

    if (existing) {
      return NextResponse.json({ 
        conversation: existing,
        message: 'Conversation already exists'
      });
    }

    // Criar conversa
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        phone_number: normalizedPhone,
        contact_name,
        contact_id,
        origin,
        status: 'open',
        is_bot_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversation: data }, { status: 201 });
  } catch (error: any) {
    console.error('Conversations POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar conversa
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const { orgId } = await getOrgIdFromSession(supabase);
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
    }

    // Campos permitidos
    const allowedFields = [
      'status', 'assigned_agent_id', 'chat_note', 
      'is_bot_active', 'bot_disabled_until', 'contact_name',
      'priority', 'unread_count'
    ];
    
    const filteredData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in updateData) {
        filteredData[field] = updateData[field];
      }
    }

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({ ...filteredData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select(`
        *,
        contact:contacts(*),
        assigned_agent:whatsapp_agents(id, name, email, avatar_url)
      `)
      .single();

    if (error) {
      console.error('Error updating conversation:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversation: data });
  } catch (error: any) {
    console.error('Conversations PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Arquivar/deletar conversa
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const { orgId } = await getOrgIdFromSession(supabase);
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const action = searchParams.get('action') || 'archive'; // archive ou delete

    if (!id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
    }

    if (action === 'delete') {
      // Deletar mensagens primeiro
      await supabase
        .from('whatsapp_messages')
        .delete()
        .eq('conversation_id', id);

      // Deletar tags
      await supabase
        .from('whatsapp_conversation_tags')
        .delete()
        .eq('conversation_id', id);

      // Deletar conversa
      const { error } = await supabase
        .from('whatsapp_conversations')
        .delete()
        .eq('id', id)
        .eq('organization_id', orgId);

      if (error) throw error;
    } else {
      // Apenas arquivar
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', orgId);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Conversations DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
