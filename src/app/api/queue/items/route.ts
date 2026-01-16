// =============================================
// API: Queue Items
// src/app/api/queue/items/route.ts
// GET - Listar itens na fila
// POST - Adicionar à fila
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// GET - Listar itens na fila
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const status = searchParams.get('status'); // waiting, assigned, all
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('queue_items')
      .select('*')
      .eq('organization_id', organizationId)
      .order('priority', { ascending: false })
      .order('entered_at', { ascending: true })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: items, error } = await query;

    if (error) throw error;

    // Buscar estatísticas
    const { data: statsData } = await supabaseAdmin.rpc('get_queue_stats', {
      p_organization_id: organizationId,
    });

    const stats = statsData?.[0] || {
      waiting_count: 0,
      assigned_count: 0,
      online_agents: 0,
      avg_wait_time_seconds: 0,
    };

    return NextResponse.json({
      items: items || [],
      stats,
    });
  } catch (error: any) {
    console.error('[Queue Items GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Adicionar conversa à fila
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      organization_id,
      store_id,
      conversation_id,
      contact_id,
      contact_name,
      contact_phone,
      instance_id,
      priority = 0,
      priority_reason,
      last_message_preview,
      metadata = {},
    } = body;

    if (!organization_id || !conversation_id) {
      return NextResponse.json({ 
        error: 'organization_id e conversation_id são obrigatórios' 
      }, { status: 400 });
    }

    // Verificar se já está na fila
    const { data: existing } = await supabaseAdmin
      .from('queue_items')
      .select('id')
      .eq('conversation_id', conversation_id)
      .eq('status', 'waiting')
      .single();

    if (existing) {
      return NextResponse.json({ 
        error: 'Conversa já está na fila',
        item: existing,
      }, { status: 409 });
    }

    // Calcular posição
    const { count } = await supabaseAdmin
      .from('queue_items')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .eq('status', 'waiting');

    const position = (count || 0) + 1;

    // Adicionar à fila
    const { data: item, error } = await supabaseAdmin
      .from('queue_items')
      .insert({
        organization_id,
        store_id,
        conversation_id,
        contact_id,
        contact_name,
        contact_phone,
        instance_id,
        position,
        priority,
        priority_reason,
        last_message_preview,
        status: 'waiting',
        metadata,
      })
      .select()
      .single();

    if (error) throw error;

    console.log('[Queue] Added conversation:', conversation_id, 'Position:', position);

    // Tentar atribuir automaticamente
    const { data: assignResult } = await supabaseAdmin.rpc('assign_next_conversation', {
      p_organization_id: organization_id,
    });

    return NextResponse.json({
      item,
      position,
      auto_assigned: assignResult?.length > 0,
      success: true,
    });
  } catch (error: any) {
    console.error('[Queue Items POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
