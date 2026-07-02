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
import { getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// =============================================
// Helper: Resolver as organizações do usuário a partir da SESSÃO
// (org padrão + memberships). NUNCA confiar em organization_id do request.
// =============================================
async function getCallerOrgIds(userId: string, defaultOrgId: string): Promise<string[]> {
  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);
  return [...new Set([defaultOrgId, ...(memberships?.map((m: any) => m.organization_id) || [])])];
}

// =============================================
// Helper: Validar acesso ao recurso (org derivada da sessão)
// =============================================
async function validateTicketAccess(ticketId: string, orgIds: string[]) {
  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .select('id, organization_id')
    .eq('id', ticketId)
    .single();

  if (error || !ticket) {
    return { valid: false as const, error: 'Ticket não encontrado', status: 404 };
  }

  // ⚠️ CRÍTICO: Verificar se pertence a uma organização do usuário
  if (!orgIds.includes(ticket.organization_id)) {
    console.error(`[SECURITY] Access denied to ticket ${ticketId} for orgs ${orgIds.join(',')}`);
    return { valid: false as const, error: 'Acesso negado a este recurso', status: 403 };
  }

  return { valid: true as const, ticket };
}

// =============================================
// GET - Detalhes do ticket
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ⚠️ SEGURANÇA: org derivada da SESSÃO, nunca do request
    const auth = await getAuthClient();
    if (!auth) return authError();
    const { user } = auth;
    const orgIds = await getCallerOrgIds(user.id, user.organization_id);

    // ⚠️ SEGURANÇA: Validar acesso ao ticket (org da sessão)
    const validation = await validateTicketAccess(params.id, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    const organizationId = validation.ticket.organization_id;

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
    // ⚠️ SEGURANÇA: org derivada da SESSÃO, nunca do request
    const auth = await getAuthClient();
    if (!auth) return authError();
    const { user } = auth;
    const orgIds = await getCallerOrgIds(user.id, user.organization_id);

    const body = await request.json();
    const {
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

    // ⚠️ SEGURANÇA: Validar acesso antes de atualizar (org da sessão)
    const validation = await validateTicketAccess(params.id, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    const organization_id = validation.ticket.organization_id;

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
    // ⚠️ SEGURANÇA: org derivada da SESSÃO, nunca do request
    const auth = await getAuthClient();
    if (!auth) return authError();
    const { user } = auth;
    const orgIds = await getCallerOrgIds(user.id, user.organization_id);

    // ⚠️ SEGURANÇA: Validar acesso antes de deletar (org da sessão)
    const validation = await validateTicketAccess(params.id, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    const organizationId = validation.ticket.organization_id;

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
