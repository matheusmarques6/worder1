// =============================================
// API: Queue Assign
// src/app/api/queue/assign/route.ts
// POST - Atribuir conversa a um agente
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// POST - Atribuir conversa
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      organization_id,
      queue_item_id,
      conversation_id,
      agent_id,
      agent_name,
      auto = false, // Se true, atribui automaticamente
    } = body;

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // Atribuição automática
    if (auto) {
      const { data: result, error } = await supabaseAdmin.rpc('assign_next_conversation', {
        p_organization_id: organization_id,
      });

      if (error) throw error;

      if (!result || result.length === 0) {
        return NextResponse.json({
          message: 'Nenhuma conversa na fila ou agentes disponíveis',
          assigned: false,
        });
      }

      return NextResponse.json({
        assigned: true,
        result: result[0],
      });
    }

    // Atribuição manual
    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id é obrigatório para atribuição manual' }, { status: 400 });
    }

    if (!queue_item_id && !conversation_id) {
      return NextResponse.json({ error: 'queue_item_id ou conversation_id é obrigatório' }, { status: 400 });
    }

    // Verificar se agente está disponível
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agent_status')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('user_id', agent_id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 });
    }

    if (agent.status !== 'online') {
      return NextResponse.json({ error: 'Agente não está online' }, { status: 400 });
    }

    if (agent.current_conversations >= agent.max_conversations) {
      return NextResponse.json({ error: 'Agente está com capacidade máxima' }, { status: 400 });
    }

    // Buscar item da fila
    let queueItem;
    if (queue_item_id) {
      const { data, error } = await supabaseAdmin
        .from('queue_items')
        .select('*')
        .eq('id', queue_item_id)
        .single();
      
      if (error || !data) {
        return NextResponse.json({ error: 'Item não encontrado na fila' }, { status: 404 });
      }
      queueItem = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('queue_items')
        .select('*')
        .eq('conversation_id', conversation_id)
        .eq('status', 'waiting')
        .single();
      
      queueItem = data;
    }

    if (queueItem) {
      // Atualizar item da fila
      await supabaseAdmin
        .from('queue_items')
        .update({
          status: 'assigned',
          assigned_at: new Date().toISOString(),
          assigned_to: agent_id,
          assigned_to_name: agent_name || agent.profile?.full_name,
          wait_time_seconds: Math.floor((Date.now() - new Date(queueItem.entered_at).getTime()) / 1000),
        })
        .eq('id', queueItem.id);
    }

    // Atualizar contadores do agente
    await supabaseAdmin
      .from('agent_status')
      .update({
        current_conversations: agent.current_conversations + 1,
        last_assigned_at: new Date().toISOString(),
        assignments_today: (agent.assignments_today || 0) + 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq('user_id', agent_id)
      .eq('organization_id', organization_id);

    // Atualizar conversa
    const conversationToUpdate = queueItem?.conversation_id || conversation_id;
    if (conversationToUpdate) {
      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          assigned_agent_id: agent_id,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', conversationToUpdate);
    }

    console.log('[Queue Assign] Assigned conversation to agent:', agent_id);

    return NextResponse.json({
      assigned: true,
      agent_id,
      conversation_id: conversationToUpdate,
    });
  } catch (error: any) {
    console.error('[Queue Assign] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
