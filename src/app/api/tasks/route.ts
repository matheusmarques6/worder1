// =============================================
// API: Tasks
// src/app/api/tasks/route.ts
// GET - Listar tarefas
// POST - Criar tarefa
// =============================================
// ⚠️ SEGURANÇA: Todas operações DEVEM ser filtradas por organization_id
// O supabaseAdmin BYPASSA RLS, então validamos manualmente
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';

// =============================================
// GET - Listar tarefas
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const status = searchParams.get('status');
    const assignedTo = searchParams.get('assigned_to');
    const contactId = searchParams.get('contact_id');
    const dealId = searchParams.get('deal_id');
    const type = searchParams.get('type');
    const priority = searchParams.get('priority');
    const dueDateStart = searchParams.get('due_date_start');
    const dueDateEnd = searchParams.get('due_date_end');
    const overdue = searchParams.get('overdue');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // ⚠️ CRÍTICO: organization_id é obrigatório para isolamento de dados
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: SEMPRE filtrar por organization_id
    let query = supabaseAdmin
      .from('tasks')
      .select(`
        *,
        contact:whatsapp_contacts(id, name, phone_number, profile_picture_url),
        deal:deals(id, title, value, status)
      `, { count: 'exact' })
      .eq('organization_id', organizationId) // ⚠️ OBRIGATÓRIO
      .order('due_date', { ascending: true })
      .range(offset, offset + limit - 1);

    // Filtros
    if (status) {
      query = query.eq('status', status);
    }

    if (assignedTo) {
      if (assignedTo === 'unassigned') {
        query = query.is('assigned_to', null);
      } else {
        query = query.eq('assigned_to', assignedTo);
      }
    }

    if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    if (dealId) {
      query = query.eq('deal_id', dealId);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    if (dueDateStart) {
      query = query.gte('due_date', dueDateStart);
    }

    if (dueDateEnd) {
      query = query.lte('due_date', dueDateEnd);
    }

    if (overdue === 'true') {
      const today = new Date().toISOString().split('T')[0];
      query = query.lt('due_date', today).in('status', ['pending', 'in_progress']);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Agrupar por período
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const grouped = {
      overdue: data?.filter(t => t.due_date < today && ['pending', 'in_progress'].includes(t.status)) || [],
      today: data?.filter(t => t.due_date === today) || [],
      tomorrow: data?.filter(t => t.due_date === tomorrow) || [],
      upcoming: data?.filter(t => t.due_date > tomorrow) || [],
      completed: data?.filter(t => t.status === 'completed') || [],
    };

    return NextResponse.json({
      tasks: data || [],
      grouped,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error: any) {
    console.error('[Tasks GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Criar tarefa
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      organization_id,
      store_id,
      contact_id,
      deal_id,
      conversation_id,
      ticket_id,
      title,
      description,
      type = 'task',
      priority = 'normal',
      due_date,
      due_time,
      all_day = false,
      reminder_at,
      assigned_to,
      assigned_to_name,
      created_by,
      created_by_name,
      tags,
      metadata = {},
    } = body;

    // ⚠️ CRÍTICO: organization_id é obrigatório para isolamento de dados
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    if (!title?.trim()) {
      return NextResponse.json({ error: 'title é obrigatório' }, { status: 400 });
    }

    if (!due_date) {
      return NextResponse.json({ error: 'due_date é obrigatório' }, { status: 400 });
    }

    // Validar tipo
    const validTypes = ['call', 'email', 'whatsapp', 'meeting', 'task', 'followup', 'payment'];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json({ error: `Tipo inválido. Use: ${validTypes.join(', ')}` }, { status: 400 });
    }

    // Validar prioridade
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (priority && !validPriorities.includes(priority)) {
      return NextResponse.json({ error: `Prioridade inválida. Use: ${validPriorities.join(', ')}` }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Se contact_id fornecido, validar que pertence à mesma organização
    if (contact_id) {
      const { data: contact } = await supabaseAdmin
        .from('whatsapp_contacts')
        .select('organization_id')
        .eq('id', contact_id)
        .single();
      
      if (contact && contact.organization_id !== organization_id) {
        console.error(`[SECURITY] Task creation blocked: contact ${contact_id} belongs to different org`);
        return NextResponse.json({ error: 'Contato não pertence a esta organização' }, { status: 403 });
      }
    }

    // ⚠️ SEGURANÇA: Se deal_id fornecido, validar que pertence à mesma organização
    if (deal_id) {
      const { data: deal } = await supabaseAdmin
        .from('deals')
        .select('organization_id')
        .eq('id', deal_id)
        .single();
      
      if (deal && deal.organization_id !== organization_id) {
        console.error(`[SECURITY] Task creation blocked: deal ${deal_id} belongs to different org`);
        return NextResponse.json({ error: 'Negócio não pertence a esta organização' }, { status: 403 });
      }
    }

    // Criar tarefa - SEMPRE com organization_id
    const { data: task, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        organization_id, // ⚠️ OBRIGATÓRIO
        store_id,
        contact_id,
        deal_id,
        conversation_id,
        ticket_id,
        title: title.trim(),
        description: description?.trim(),
        type,
        priority,
        due_date,
        due_time,
        all_day,
        reminder_at,
        assigned_to,
        assigned_to_name,
        created_by,
        created_by_name,
        status: 'pending',
        tags,
        metadata,
      })
      .select(`
        *,
        contact:whatsapp_contacts(id, name, phone_number),
        deal:deals(id, title, value)
      `)
      .single();

    if (error) throw error;

    console.log('[Tasks] Created:', task.id, 'Org:', organization_id);

    return NextResponse.json({
      task,
      success: true,
    });
  } catch (error: any) {
    console.error('[Tasks POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
