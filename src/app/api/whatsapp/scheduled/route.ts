// =============================================
// API: Scheduled Messages
// src/app/api/whatsapp/scheduled/route.ts
// GET - Listar mensagens agendadas
// POST - Criar agendamento
// =============================================
// ✅ P1 v2: org SEMPRE derivada do token (requireOrgFromAuth);
// organization_id de query/body é aceito e IGNORADO (compat com
// useScheduledMessages, que continua enviando o campo).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
export const dynamic = 'force-dynamic';

// =============================================
// GET - Listar mensagens agendadas
// =============================================
export async function GET(request: NextRequest) {
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending, sent, failed, cancelled
    const contactId = searchParams.get('contact_id');
    const instanceId = searchParams.get('instance_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabaseAdmin
      .from('scheduled_messages')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    if (instanceId) {
      query = query.eq('instance_id', instanceId);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Contar por status
    const { data: statusCounts } = await supabaseAdmin
      .from('scheduled_messages')
      .select('status')
      .eq('organization_id', organizationId);

    const stats = {
      pending: statusCounts?.filter(s => s.status === 'pending').length || 0,
      sent: statusCounts?.filter(s => s.status === 'sent').length || 0,
      failed: statusCounts?.filter(s => s.status === 'failed').length || 0,
      cancelled: statusCounts?.filter(s => s.status === 'cancelled').length || 0,
      total: statusCounts?.length || 0,
    };

    return NextResponse.json({
      messages: data || [],
      stats,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error: any) {
    console.error('[Scheduled GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Criar agendamento
// =============================================
export async function POST(request: NextRequest) {
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const body = await request.json();
    const {
      // organization_id do body é IGNORADO (P1 v2)
      store_id,
      instance_id,
      instance_name,
      contact_id,
      conversation_id,
      phone_number,
      contact_name,
      message_type = 'text',
      content,
      media_url,
      media_type,
      media_filename,
      template_name,
      template_params,
      scheduled_at,
      timezone = 'America/Sao_Paulo',
      recurrence,
      recurrence_end_date,
      created_by,
      created_by_name,
      metadata = {},
    } = body;

    if (!phone_number) {
      return NextResponse.json({ error: 'phone_number é obrigatório' }, { status: 400 });
    }

    if (!content) {
      return NextResponse.json({ error: 'content é obrigatório' }, { status: 400 });
    }

    if (!scheduled_at) {
      return NextResponse.json({ error: 'scheduled_at é obrigatório' }, { status: 400 });
    }

    // Validar data futura
    const scheduledDate = new Date(scheduled_at);
    if (scheduledDate <= new Date()) {
      return NextResponse.json({
        error: 'A data de agendamento deve ser no futuro'
      }, { status: 400 });
    }

    // Validar recorrência
    const validRecurrences = ['daily', 'weekly', 'monthly', null];
    if (recurrence && !validRecurrences.includes(recurrence)) {
      return NextResponse.json({
        error: 'Recorrência inválida. Use: daily, weekly ou monthly'
      }, { status: 400 });
    }

    // Criar agendamento — org do token, criador do token (fallback p/ body)
    const { data: scheduled, error } = await supabaseAdmin
      .from('scheduled_messages')
      .insert({
        organization_id: organizationId,
        store_id,
        instance_id,
        instance_name,
        contact_id,
        conversation_id,
        phone_number: phone_number.replace(/\D/g, ''),
        contact_name,
        message_type,
        content,
        media_url,
        media_type,
        media_filename,
        template_name,
        template_params,
        scheduled_at,
        timezone,
        recurrence,
        recurrence_end_date,
        status: 'pending',
        created_by: created_by || auth.userId,
        created_by_name,
        metadata,
      })
      .select()
      .single();

    if (error) throw error;

    console.log('[Scheduled] Created:', scheduled.id);

    return NextResponse.json({
      message: scheduled,
      success: true,
    });
  } catch (error: any) {
    console.error('[Scheduled POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
