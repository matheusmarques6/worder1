// =============================================
// API: Queue Agents
// src/app/api/queue/agents/route.ts
// GET - Listar agentes e status
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// =============================================
// GET - Listar agentes
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const status = searchParams.get('status'); // online, offline, all

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // Buscar agentes com perfil
    let query = supabaseAdmin
      .from('agent_status')
      .select(`
        *,
        profile:profiles!user_id(
          id,
          full_name,
          email,
          avatar_url
        )
      `)
      .eq('organization_id', organizationId)
      .order('status', { ascending: true })
      .order('current_conversations', { ascending: true });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: agents, error } = await query;

    if (error) throw error;

    // Calcular métricas
    const metrics = {
      total: agents?.length || 0,
      online: agents?.filter(a => a.status === 'online').length || 0,
      busy: agents?.filter(a => a.status === 'busy').length || 0,
      away: agents?.filter(a => a.status === 'away').length || 0,
      offline: agents?.filter(a => a.status === 'offline').length || 0,
      on_break: agents?.filter(a => a.on_break).length || 0,
      total_conversations: agents?.reduce((sum, a) => sum + (a.current_conversations || 0), 0) || 0,
      available_capacity: agents?.reduce((sum, a) => {
        if (a.status === 'online' && !a.on_break) {
          return sum + (a.max_conversations - a.current_conversations);
        }
        return sum;
      }, 0) || 0,
    };

    return NextResponse.json({
      agents: agents || [],
      metrics,
    });
  } catch (error: any) {
    console.error('[Queue Agents GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
