import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

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
