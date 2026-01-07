import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Cliente admin
let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key && !url.includes('placeholder')) {
      supabaseAdmin = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }
  return supabaseAdmin;
}

// Obter usuário autenticado
async function getAuthUser() {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const cookieStore = cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  
  if (!accessToken) return null;
  
  const { data: { user }, error } = await admin.auth.getUser(accessToken);
  if (error || !user) return null;
  
  // Buscar organization_id do profile
  const { data: profile } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  
  return { user, admin, organizationId: profile?.organization_id || user.user_metadata?.organization_id };
}

// Verificar se agente está online (última atividade < 2 minutos)
function isAgentOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const lastSeen = new Date(lastSeenAt);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
  return diffMinutes < 2;
}

// GET - Listar status de todos os agentes da organização
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { admin, organizationId } = auth;

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 400 });
    }

    // Buscar todos os agentes da organização
    const { data: agents, error } = await admin
      .from('agents')
      .select(`
        id,
        name,
        email,
        status,
        last_seen_at,
        avatar_url
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching agents:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mapear agentes com status calculado
    const agentsWithStatus = (agents || []).map(agent => {
      // Se o agente tem status explícito (online/away/busy), usar
      // Se não, calcular baseado em last_seen_at
      let calculatedStatus = agent.status || 'offline';
      
      if (calculatedStatus === 'online' && !isAgentOnline(agent.last_seen_at)) {
        calculatedStatus = 'offline';
      }

      return {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        avatar_url: agent.avatar_url,
        status: calculatedStatus,
        last_seen_at: agent.last_seen_at,
      };
    });

    // Ordenar: online primeiro, depois por nome
    agentsWithStatus.sort((a, b) => {
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (a.status !== 'online' && b.status === 'online') return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ agents: agentsWithStatus });

  } catch (error: any) {
    console.error('Agents status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Atualizar heartbeat (agente está ativo)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, admin } = auth;
    const body = await request.json();
    const { agent_id, status } = body;

    // Se não passou agent_id, tentar pegar do user_metadata
    const agentId = agent_id || user.user_metadata?.agent_id;

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
    }

    // Atualizar last_seen_at e opcionalmente status
    const updateData: any = {
      last_seen_at: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
    }

    const { error } = await admin
      .from('agents')
      .update(updateData)
      .eq('id', agentId);

    if (error) {
      console.error('Error updating agent status:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Agent heartbeat error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
