// =============================================
// API: Ticket by ID
// src/app/api/tickets/[id]/route.ts
// GET - Detalhes do ticket
// PUT - Atualizar ticket
// DELETE - Remover ticket
// =============================================
// ⚠️ SEGURANÇA: Valida organization_id antes de qualquer operação
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';

// =============================================
// Helper: Validar acesso ao recurso
// =============================================
async function validateTicketAccess(ticketId: string, organizationId: string) {
  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .select('id, organization_id')
    .eq('id', ticketId)
    .single();

  if (error || !ticket) {
    return { valid: false, error: 'Ticket não encontrado', status: 404 };
  }

  // ⚠️ CRÍTICO: Verificar se pertence à organização
  if (ticket.organization_id !== organizationId) {
    console.error(`[SECURITY] Access denied to ticket ${ticketId} for org ${organizationId}`);
    return { valid: false, error: 'Acesso negado a este recurso', status: 403 };
  }

  return { valid: true, ticket };
}

// =============================================
// GET - Detalhes do ticket
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');

    // ⚠️ CRÍTICO: organization_id obrigatório
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Buscar ticket FILTRADO por organization_id
    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', organizationId) // ⚠️ OBRIGATÓRIO
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
      }
      throw error;
    }

    // Buscar comentários - também filtrados por organization_id
    const { data: comments } = await supabaseAdmin
      .from('ticket_comments')
      .select('*')
      .eq('ticket_id', params.id)
      .eq('organization_id', organizationId) // ⚠️ OBRIGATÓRIO
      .order('created_at', { ascending: true });

    // Buscar histórico - também filtrado por organization_id
    const { data: history } = await supabaseAdmin
      .from('ticket_history')
      .select('*')
      .eq('ticket_id', params.id)
      .eq('organization_id', organizationId) // ⚠️ OBRIGATÓRIO
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      ticket,
      comments: comments || [],
      history: history || [],
    });
  } catch (error: any) {
    console.error('[Ticket GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PUT - Atualizar ticket
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const {
      organization_id, // ⚠️ OBRIGATÓRIO para validação
      title,
      description,
      category,
      subcategory,
      priority,
      status,
      assigned_to,
      assigned_to_name,
      team_id,
      team_name,
      sla_due_at,
      resolution_notes,
      satisfaction_rating,
      satisfaction_comment,
      tags,
      custom_fields,
      // Quem está atualizando
      updated_by,
      updated_by_name,
    } = body;

    // ⚠️ CRÍTICO: organization_id obrigatório
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Validar acesso antes de atualizar
    const validation = await validateTicketAccess(params.id, organization_id);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    // Buscar ticket atual para comparações
    const { data: existing } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', organization_id)
      .single();

    // Preparar updates
    const updates: Record<string, any> = {};

    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim();
    if (category !== undefined) updates.category = category;
    if (subcategory !== undefined) updates.subcategory = subcategory;
    if (priority !== undefined) updates.priority = priority;
    if (team_id !== undefined) updates.team_id = team_id;
    if (team_name !== undefined) updates.team_name = team_name;
    if (sla_due_at !== undefined) updates.sla_due_at = sla_due_at;
    if (resolution_notes !== undefined) updates.resolution_notes = resolution_notes;
    if (tags !== undefined) updates.tags = tags;
    if (custom_fields !== undefined) updates.custom_fields = custom_fields;

    // Tratar atribuição
    if (assigned_to !== undefined && assigned_to !== existing?.assigned_to) {
      updates.assigned_to = assigned_to;
      updates.assigned_to_name = assigned_to_name;
      updates.assigned_at = assigned_to ? new Date().toISOString() : null;
    }

    // Tratar mudança de status
    if (status !== undefined && status !== existing?.status) {
      updates.status = status;
      
      if (['resolved', 'closed'].includes(status)) {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = updated_by;
        updates.resolved_by_name = updated_by_name;
      }
    }

    // Tratar satisfação
    if (satisfaction_rating !== undefined) {
      updates.satisfaction_rating = satisfaction_rating;
      updates.satisfaction_comment = satisfaction_comment;
      updates.satisfaction_submitted_at = new Date().toISOString();
    }

    // Verificar SLA breach
    if (existing?.sla_due_at && !existing?.sla_breached) {
      if (new Date() > new Date(existing.sla_due_at)) {
        updates.sla_breached = true;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Update com filtro de organization_id
    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', organization_id) // ⚠️ OBRIGATÓRIO
      .select()
      .single();

    if (error) throw error;

    console.log('[Ticket UPDATE] Updated:', params.id, 'Org:', organization_id);

    return NextResponse.json({
      ticket,
      success: true,
    });
  } catch (error: any) {
    console.error('[Ticket PUT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Remover ticket
// =============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');

    // ⚠️ CRÍTICO: organization_id obrigatório
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Validar acesso antes de deletar
    const validation = await validateTicketAccess(params.id, organizationId);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    // ⚠️ SEGURANÇA: Delete com filtro de organization_id
    // Comentários e histórico são deletados automaticamente por CASCADE
    const { error } = await supabaseAdmin
      .from('tickets')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', organizationId); // ⚠️ OBRIGATÓRIO

    if (error) throw error;

    console.log('[Ticket DELETE] Deleted:', params.id, 'Org:', organizationId);

    return NextResponse.json({
      success: true,
      message: 'Ticket removido',
    });
  } catch (error: any) {
    console.error('[Ticket DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
