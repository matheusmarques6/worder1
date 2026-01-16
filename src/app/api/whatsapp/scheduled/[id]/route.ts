// =============================================
// API: Scheduled Message by ID
// src/app/api/whatsapp/scheduled/[id]/route.ts
// GET - Detalhes de um agendamento
// PUT - Atualizar agendamento
// DELETE - Cancelar/remover agendamento
// =============================================
// ⚠️ SEGURANÇA: OBRIGATÓRIO validar organization_id
// NUNCA permitir acesso a dados de outra organização
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// Helper: Validar acesso ao recurso
// =============================================
async function validateScheduledMessageAccess(messageId: string, organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from('scheduled_messages')
    .select('id, organization_id')
    .eq('id', messageId)
    .eq('organization_id', organizationId) // ⚠️ CRÍTICO
    .single();

  if (error || !data) {
    return { valid: false };
  }

  // Verificação adicional de segurança
  if (data.organization_id !== organizationId) {
    console.error(`[SECURITY VIOLATION] Scheduled message ${messageId} access denied for org ${organizationId}`);
    return { valid: false };
  }

  return { valid: true, message: data };
}

// =============================================
// GET - Detalhes do agendamento
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');

    // ⚠️ CRÍTICO: organization_id é OBRIGATÓRIO
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Buscar FILTRADO por organization_id
    const { data, error } = await supabaseAdmin
      .from('scheduled_messages')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', organizationId) // ⚠️ CRÍTICO
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ message: data });
  } catch (error: any) {
    console.error('[Scheduled GET ID] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PUT - Atualizar agendamento
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const {
      organization_id, // ⚠️ OBRIGATÓRIO
      content,
      media_url,
      media_type,
      media_filename,
      scheduled_at,
      recurrence,
      recurrence_end_date,
    } = body;

    // ⚠️ CRÍTICO: organization_id é OBRIGATÓRIO
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Validar acesso antes de atualizar
    const validation = await validateScheduledMessageAccess(params.id, organization_id);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    // Buscar agendamento atual
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('scheduled_messages')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', organization_id) // ⚠️ CRÍTICO
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    // Não permitir editar mensagens já enviadas
    if (existing.status === 'sent') {
      return NextResponse.json({ error: 'Não é possível editar mensagem já enviada' }, { status: 400 });
    }

    // Preparar updates
    const updates: Record<string, any> = {};

    if (content !== undefined) updates.content = content;
    if (media_url !== undefined) updates.media_url = media_url;
    if (media_type !== undefined) updates.media_type = media_type;
    if (media_filename !== undefined) updates.media_filename = media_filename;
    if (recurrence !== undefined) updates.recurrence = recurrence;
    if (recurrence_end_date !== undefined) updates.recurrence_end_date = recurrence_end_date;

    // Validar nova data se fornecida
    if (scheduled_at !== undefined) {
      const scheduleDate = new Date(scheduled_at);
      if (scheduleDate <= new Date()) {
        return NextResponse.json({ error: 'A data de agendamento deve ser no futuro' }, { status: 400 });
      }
      updates.scheduled_at = scheduled_at;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Update com filtro de organization_id
    const { data, error } = await supabaseAdmin
      .from('scheduled_messages')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', organization_id) // ⚠️ CRÍTICO
      .select()
      .single();

    if (error) throw error;

    console.log('[Scheduled UPDATE] Updated:', params.id, 'Org:', organization_id);

    return NextResponse.json({
      message: data,
      success: true,
    });
  } catch (error: any) {
    console.error('[Scheduled PUT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Cancelar/remover agendamento
// =============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const hard = searchParams.get('hard') === 'true';

    // ⚠️ CRÍTICO: organization_id é OBRIGATÓRIO
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Validar acesso antes de deletar
    const validation = await validateScheduledMessageAccess(params.id, organizationId);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    if (hard) {
      // Deletar permanentemente - com filtro de organization_id
      const { error } = await supabaseAdmin
        .from('scheduled_messages')
        .delete()
        .eq('id', params.id)
        .eq('organization_id', organizationId); // ⚠️ CRÍTICO

      if (error) throw error;

      console.log('[Scheduled HARD DELETE] Deleted:', params.id, 'Org:', organizationId);

      return NextResponse.json({
        success: true,
        message: 'Agendamento removido permanentemente',
      });
    } else {
      // Soft delete (cancelar) - com filtro de organization_id
      const { data, error } = await supabaseAdmin
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', params.id)
        .eq('organization_id', organizationId) // ⚠️ CRÍTICO
        .select()
        .single();

      if (error) throw error;

      console.log('[Scheduled CANCEL] Cancelled:', params.id, 'Org:', organizationId);

      return NextResponse.json({
        message: data,
        success: true,
      });
    }
  } catch (error: any) {
    console.error('[Scheduled DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
