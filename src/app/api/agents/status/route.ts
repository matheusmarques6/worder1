// =============================================
// API: Agent Status
// src/app/api/agents/status/route.ts
// GET - Buscar status do agente logado
// PUT - Atualizar status
// =============================================
// ⚠️ SEGURANÇA: OBRIGATÓRIO validar organization_id
// NUNCA permitir acesso a dados de outra organização
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// GET - Buscar status do agente
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const userId = searchParams.get('user_id');

    // ⚠️ CRÍTICO: organization_id é OBRIGATÓRIO para isolamento de dados
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'user_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Buscar status FILTRADO por organization_id
    let { data: status, error } = await supabaseAdmin
      .from('agent_status')
      .select('*')
      .eq('organization_id', organizationId) // ⚠️ CRÍTICO
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Não existe, criar - SEMPRE com organization_id
      const { data: newStatus, error: createError } = await supabaseAdmin
        .from('agent_status')
        .insert({
          organization_id: organizationId, // ⚠️ CRÍTICO
          user_id: userId,
          status: 'offline',
        })
        .select()
        .single();

      if (createError) throw createError;
      status = newStatus;
    } else if (error) {
      throw error;
    }

    return NextResponse.json({ status });
  } catch (error: any) {
    console.error('[Agent Status GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PUT - Atualizar status
// =============================================
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      organization_id, // ⚠️ OBRIGATÓRIO
      user_id,
      status,
      status_message,
      max_conversations,
      on_break,
      break_reason,
      skills,
    } = body;

    // ⚠️ CRÍTICO: organization_id é OBRIGATÓRIO para isolamento de dados
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    if (!user_id) {
      return NextResponse.json({ error: 'user_id é obrigatório' }, { status: 400 });
    }

    // Preparar updates
    const updates: Record<string, any> = {
      last_activity_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      const validStatuses = ['online', 'busy', 'away', 'offline'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ 
          error: `Status inválido. Use: ${validStatuses.join(', ')}` 
        }, { status: 400 });
      }
      updates.status = status;
    }

    if (status_message !== undefined) updates.status_message = status_message;
    if (max_conversations !== undefined) updates.max_conversations = max_conversations;
    if (skills !== undefined) updates.skills = skills;

    // Tratar pausa
    if (on_break !== undefined) {
      updates.on_break = on_break;
      if (on_break) {
        updates.break_started_at = new Date().toISOString();
        updates.break_reason = break_reason || null;
      } else {
        updates.break_started_at = null;
        updates.break_reason = null;
      }
    }

    // ⚠️ SEGURANÇA: Upsert SEMPRE com organization_id no conflito
    const { data: agentStatus, error } = await supabaseAdmin
      .from('agent_status')
      .upsert({
        organization_id, // ⚠️ CRÍTICO
        user_id,
        ...updates,
      }, {
        onConflict: 'organization_id,user_id',
      })
      .select()
      .single();

    if (error) throw error;

    console.log('[Agent Status] Updated:', user_id, 'Status:', status || agentStatus.status, 'Org:', organization_id);

    // Se ficou online, tentar processar fila
    if (status === 'online') {
      await supabaseAdmin.rpc('assign_next_conversation', {
        p_organization_id: organization_id,
      });
    }

    return NextResponse.json({ status: agentStatus, success: true });
  } catch (error: any) {
    console.error('[Agent Status PUT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
