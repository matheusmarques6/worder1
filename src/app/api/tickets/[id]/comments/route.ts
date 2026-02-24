// =============================================
// API: Ticket Comments
// src/app/api/tickets/[id]/comments/route.ts
// GET - Listar comentários
// POST - Adicionar comentário
// =============================================
// ⚠️ SEGURANÇA: OBRIGATÓRIO validar organization_id
// NUNCA permitir acesso a dados de outra organização
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';

// =============================================
// Helper: Validar acesso ao ticket
// =============================================
async function validateTicketAccess(ticketId: string, organizationId: string) {
  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .select('id, organization_id')
    .eq('id', ticketId)
    .eq('organization_id', organizationId) // ⚠️ CRÍTICO
    .single();

  if (error || !ticket) {
    return { valid: false, ticket: null };
  }

  // Verificação adicional de segurança
  if (ticket.organization_id !== organizationId) {
    console.error(`[SECURITY VIOLATION] Ticket ${ticketId} access denied for org ${organizationId}`);
    return { valid: false, ticket: null };
  }

  return { valid: true, ticket };
}

// =============================================
// GET - Listar comentários
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const includeInternal = searchParams.get('include_internal') !== 'false';

    // ⚠️ CRÍTICO: organization_id é OBRIGATÓRIO
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Validar acesso ao ticket primeiro
    const validation = await validateTicketAccess(params.id, organizationId);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    // ⚠️ SEGURANÇA: Buscar comentários FILTRADOS por organization_id
    let query = supabaseAdmin
      .from('ticket_comments')
      .select('*')
      .eq('ticket_id', params.id)
      .eq('organization_id', organizationId) // ⚠️ CRÍTICO
      .order('created_at', { ascending: true });

    if (!includeInternal) {
      query = query.eq('is_internal', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      comments: data || [],
      count: data?.length || 0,
    });
  } catch (error: any) {
    console.error('[Ticket Comments GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Adicionar comentário
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const {
      organization_id, // ⚠️ OBRIGATÓRIO
      content,
      content_html,
      is_internal = false,
      attachments = [],
      user_id,
      user_name,
      user_email,
      user_avatar_url,
    } = body;

    // ⚠️ CRÍTICO: organization_id é OBRIGATÓRIO
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Validar acesso ao ticket primeiro
    const validation = await validateTicketAccess(params.id, organization_id);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    // Buscar ticket para verificar first_response
    const { data: ticket } = await supabaseAdmin
      .from('tickets')
      .select('first_response_at')
      .eq('id', params.id)
      .eq('organization_id', organization_id) // ⚠️ CRÍTICO
      .single();

    // ⚠️ SEGURANÇA: Criar comentário SEMPRE com organization_id
    const { data: comment, error } = await supabaseAdmin
      .from('ticket_comments')
      .insert({
        organization_id, // ⚠️ CRÍTICO
        ticket_id: params.id,
        content: content.trim(),
        content_html,
        is_internal,
        attachments,
        user_id,
        user_name,
        user_email,
        user_avatar_url,
      })
      .select()
      .single();

    if (error) throw error;

    // Atualizar first_response_at se for a primeira resposta não-interna
    if (!is_internal && !ticket?.first_response_at) {
      await supabaseAdmin
        .from('tickets')
        .update({
          first_response_at: new Date().toISOString(),
          first_response_sla_met: true,
        })
        .eq('id', params.id)
        .eq('organization_id', organization_id); // ⚠️ CRÍTICO
    }

    // Atualizar status se necessário
    if (!is_internal) {
      const { data: currentTicket } = await supabaseAdmin
        .from('tickets')
        .select('status')
        .eq('id', params.id)
        .eq('organization_id', organization_id) // ⚠️ CRÍTICO
        .single();

      // Se estava aguardando cliente, mover para em andamento
      if (currentTicket?.status === 'waiting_customer') {
        await supabaseAdmin
          .from('tickets')
          .update({ status: 'in_progress' })
          .eq('id', params.id)
          .eq('organization_id', organization_id); // ⚠️ CRÍTICO
      }
    }

    console.log('[Ticket Comment] Created:', comment.id, 'Org:', organization_id);

    return NextResponse.json({
      comment,
      success: true,
    });
  } catch (error: any) {
    console.error('[Ticket Comments POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
