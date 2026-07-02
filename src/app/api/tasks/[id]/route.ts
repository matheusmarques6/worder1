// =============================================
// API: Task by ID
// src/app/api/tasks/[id]/route.ts
// GET - Detalhes da tarefa
// PUT - Atualizar tarefa
// DELETE - Remover tarefa
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
async function validateTaskAccess(taskId: string, orgIds: string[]) {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('id, organization_id')
    .eq('id', taskId)
    .single();

  if (error || !task) {
    return { valid: false as const, error: 'Tarefa não encontrada', status: 404 };
  }

  // ⚠️ CRÍTICO: Verificar se pertence a uma organização do usuário
  if (!orgIds.includes(task.organization_id)) {
    console.error(`[SECURITY] Access denied to task ${taskId} for orgs ${orgIds.join(',')}`);
    return { valid: false as const, error: 'Acesso negado a este recurso', status: 403 };
  }

  return { valid: true as const, task };
}

// =============================================
// GET - Detalhes da tarefa
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

    // ⚠️ SEGURANÇA: Validar acesso à tarefa (org da sessão)
    const validation = await validateTaskAccess(params.id, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    const organizationId = validation.task.organization_id;

    // ⚠️ SEGURANÇA: Buscar tarefa FILTRADA por organization_id
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select(`
        *,
        contact:whatsapp_contacts(id, name, phone_number, email, profile_picture_url),
        deal:deals(id, title, value, status, pipeline_id, stage_id)
      `)
      .eq('id', params.id)
      .eq('organization_id', organizationId) // ⚠️ OBRIGATÓRIO
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ task: data });
  } catch (error: any) {
    console.error('[Task GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PUT - Atualizar tarefa
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
      type,
      priority,
      due_date,
      due_time,
      all_day,
      reminder_at,
      assigned_to,
      assigned_to_name,
      status,
      outcome,
      outcome_type,
      tags,
      metadata,
    } = body;

    // ⚠️ SEGURANÇA: Validar acesso antes de atualizar (org da sessão)
    const validation = await validateTaskAccess(params.id, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    const organization_id = validation.task.organization_id;

    // Preparar updates
    const updates: Record<string, any> = {};

    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim();
    if (type !== undefined) updates.type = type;
    if (priority !== undefined) updates.priority = priority;
    if (due_date !== undefined) updates.due_date = due_date;
    if (due_time !== undefined) updates.due_time = due_time;
    if (all_day !== undefined) updates.all_day = all_day;
    if (reminder_at !== undefined) updates.reminder_at = reminder_at;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (assigned_to_name !== undefined) updates.assigned_to_name = assigned_to_name;
    if (outcome !== undefined) updates.outcome = outcome;
    if (outcome_type !== undefined) updates.outcome_type = outcome_type;
    if (tags !== undefined) updates.tags = tags;
    if (metadata !== undefined) updates.metadata = metadata;

    // Tratar mudança de status
    if (status !== undefined) {
      updates.status = status;
      
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
      } else if (status !== 'completed') {
        updates.completed_at = null;
        updates.completed_by = null;
        updates.completed_by_name = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Update com filtro de organization_id
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', organization_id) // ⚠️ OBRIGATÓRIO
      .select(`
        *,
        contact:whatsapp_contacts(id, name, phone_number),
        deal:deals(id, title, value)
      `)
      .single();

    if (error) throw error;

    console.log('[Task UPDATE] Updated:', params.id, 'Org:', organization_id);

    return NextResponse.json({
      task: data,
      success: true,
    });
  } catch (error: any) {
    console.error('[Task PUT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Remover tarefa
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
    const validation = await validateTaskAccess(params.id, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    const organizationId = validation.task.organization_id;

    // ⚠️ SEGURANÇA: Delete com filtro de organization_id
    const { error } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', organizationId); // ⚠️ OBRIGATÓRIO

    if (error) throw error;

    console.log('[Task DELETE] Deleted:', params.id, 'Org:', organizationId);

    return NextResponse.json({
      success: true,
      message: 'Tarefa removida',
    });
  } catch (error: any) {
    console.error('[Task DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
