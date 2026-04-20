import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// GET - List agents with status (for transfer modal, etc.)
export async function GET(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId') || searchParams.get('organization_id');

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    }

    // Prefer whatsapp_agent_status (new schema) with fallback to agents/whatsapp_agents
    let agents: any[] = [];

    // Try whatsapp_agent_status joined with users
    const { data: statusData } = await supabase
      .from('whatsapp_agent_status')
      .select('agent_id, organization_id, status, active_conversations, max_conversations, last_seen_at')
      .eq('organization_id', organizationId);

    if (statusData && statusData.length > 0) {
      agents = statusData.map((s: any) => ({
        id: s.agent_id,
        agent_id: s.agent_id,
        organization_id: s.organization_id,
        status: s.status,
        active_conversations: s.active_conversations || 0,
        max_conversations: s.max_conversations || 10,
        last_seen_at: s.last_seen_at,
      }));
    } else {
      // Fallback: try agents table
      const { data: agentData } = await supabase
        .from('agents')
        .select('*')
        .eq('organization_id', organizationId);

      if (agentData) {
        agents = agentData.map((a: any) => ({
          id: a.id,
          agent_id: a.id,
          organization_id: a.organization_id,
          name: a.name,
          status: a.status || 'offline',
          active_conversations: 0,
          max_conversations: 10,
          last_seen_at: a.last_seen_at,
        }));
      }
    }

    return NextResponse.json({ data: agents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar status do agente
export async function PATCH(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { agent_id, organization_id, organizationId, status } = body;
    const orgId = organization_id || organizationId;

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    if (!status || !['online', 'offline', 'away', 'busy'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Atualizar status
    const { data, error } = await supabase
      .from('agents')
      .update({
        status,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent_id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) {
      // Tentar tabela antiga
      const oldResult = await supabase
        .from('whatsapp_agents')
        .update({
          is_available: status === 'online',
          updated_at: new Date().toISOString(),
        })
        .eq('id', agent_id)
        .eq('organization_id', orgId)
        .select()
        .single();

      if (oldResult.error) {
        throw oldResult.error;
      }

      return NextResponse.json({ agent: oldResult.data });
    }

    return NextResponse.json({ agent: data });
  } catch (error: any) {
    console.error('Error updating agent status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
