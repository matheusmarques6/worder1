// =============================================
// API: Tickets
// src/app/api/tickets/route.ts
// GET - Listar tickets
// POST - Criar ticket
// =============================================
// ⚠️ SEGURANÇA: Todas operações DEVEM ser filtradas por organization_id
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// =============================================
// GET - Listar tickets
// =============================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    const organizationId = auth.user.organization_id;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const assignedTo = searchParams.get('assigned_to');
    const contactId = searchParams.get('contact_id');
    const orderId = searchParams.get('order_id');
    const storeId = searchParams.get('storeId') || searchParams.get('store_id');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Tickets table has no store_id column — scope by the linked
    // contact's store. Multi-store orgs (Dr. Melaxin + Based no
    // mesmo organization_id) viam tickets cruzados antes desse filtro.
    let storeContactIds: string[] | null = null;
    if (storeId && !contactId) {
      const { data: storeContacts } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`store_id.eq.${storeId},store_id.is.null`);
      const ids: string[] = (storeContacts || []).map((c: any) => c.id);
      storeContactIds = ids;
      if (ids.length === 0) {
        return NextResponse.json({
          tickets: [],
          pagination: { total: 0, limit, offset, hasMore: false },
        });
      }
    }

    // ⚠️ SEGURANÇA: SEMPRE filtrar por organization_id
    let query = supabaseAdmin
      .from('tickets')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId) // ⚠️ OBRIGATÓRIO
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (storeContactIds) {
      query = query.in('contact_id', storeContactIds);
    }

    // Filtros
    if (status) {
      if (status === 'active') {
        query = query.in('status', ['open', 'in_progress', 'waiting_customer', 'waiting_internal']);
      } else {
        query = query.eq('status', status);
      }
    }

    if (category) query = query.eq('category', category);
    if (priority) query = query.eq('priority', priority);
    if (assignedTo) {
      if (assignedTo === 'unassigned') {
        query = query.is('assigned_to', null);
      } else {
        query = query.eq('assigned_to', assignedTo);
      }
    }
    if (contactId) query = query.eq('contact_id', contactId);
    if (orderId) query = query.eq('order_id', orderId);

    // Busca por texto
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,ticket_number.eq.${parseInt(search) || 0}`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      tickets: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error: any) {
    console.error('[Tickets GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Criar ticket
// =============================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    const organization_id = auth.user.organization_id;

    const body = await request.json();
    const {
      store_id,
      title,
      description,
      category = 'question',
      subcategory,
      priority = 'normal',
      contact_id,
      contact_name,
      contact_email,
      contact_phone,
      order_id,
      order_number,
      conversation_id,
      deal_id,
      assigned_to,
      assigned_to_name,
      team_id,
      team_name,
      sla_hours,
      tags,
      custom_fields,
      source = 'manual',
      source_message_id,
      created_by,
      created_by_name,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'title é obrigatório' }, { status: 400 });
    }

    // Validar categoria
    const validCategories = ['delivery', 'payment', 'product', 'refund', 'question', 'bug', 'feature', 'other'];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json({ error: `Categoria inválida. Use: ${validCategories.join(', ')}` }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Se contact_id fornecido, validar que pertence à mesma organização
    if (contact_id) {
      const { data: contact } = await supabaseAdmin
        .from('whatsapp_contacts')
        .select('organization_id')
        .eq('id', contact_id)
        .single();
      
      if (contact && contact.organization_id !== organization_id) {
        console.error(`[SECURITY] Ticket creation blocked: contact ${contact_id} belongs to different org`);
        return NextResponse.json({ error: 'Contato não pertence a esta organização' }, { status: 403 });
      }
    }

    // Calcular SLA (se configurado)
    let sla_due_at: string | null = null;
    if (sla_hours) {
      sla_due_at = new Date(Date.now() + sla_hours * 3600000).toISOString();
    }

    // Criar ticket - SEMPRE com organization_id
    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .insert({
        organization_id, // ⚠️ OBRIGATÓRIO
        store_id,
        title: title.trim(),
        description: description?.trim(),
        category,
        subcategory,
        priority,
        status: 'open',
        contact_id,
        contact_name,
        contact_email,
        contact_phone,
        order_id,
        order_number,
        conversation_id,
        deal_id,
        assigned_to,
        assigned_to_name,
        assigned_at: assigned_to ? new Date().toISOString() : null,
        team_id,
        team_name,
        sla_due_at,
        tags,
        custom_fields,
        source,
        source_message_id,
        created_by,
        created_by_name,
      })
      .select()
      .single();

    if (error) throw error;

    console.log('[Tickets] Created:', ticket.id, 'Number:', ticket.ticket_number, 'Org:', organization_id);

    return NextResponse.json({
      ticket,
      success: true,
    });
  } catch (error: any) {
    console.error('[Tickets POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
