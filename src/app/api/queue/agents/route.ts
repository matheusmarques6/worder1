// =============================================
// API: Queue Agents
// src/app/api/queue/agents/route.ts
// GET - Listar agentes e status
// =============================================
// SEGURANÇA: a org vem da SESSÃO. Até 28/08 esta rota lia organization_id da
// query string e consultava com service_role, que passa por cima da RLS — um
// UUID bastava para listar os atendentes de qualquer loja, com nome, e-mail e
// avatar de cada perfil, mais as métricas de capacidade da operação.
//
// `status` é outra coisa: filtro legítimo, continua vindo do cliente. A
// distinção é a regra — parâmetro de consulta o cliente escolhe, fronteira de
// tenancy nunca.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';

export const dynamic = 'force-dynamic';

// =============================================
// GET - Listar agentes
// =============================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request);
    if (auth instanceof NextResponse) return auth;
    const organizationId = auth.orgId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // online, offline, all

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
