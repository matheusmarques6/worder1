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

// GET - Buscar permissões do agente
export async function GET(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const agentId = searchParams.get('agent_id');
  const orgId = searchParams.get('organization_id') || searchParams.get('organizationId');

  if (!agentId) {
    return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
  }

  if (!orgId) {
    return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
  }

  try {
    // Verificar se o agente pertence à organização
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('id', agentId)
      .eq('organization_id', orgId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Buscar permissões
    let { data: permissions, error } = await supabase
      .from('agent_permissions')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not an error, just no permissions yet)
      throw error;
    }

    // Se não tem permissões, retornar defaults
    if (!permissions) {
      permissions = {
        agent_id: agentId,
        access_level: 'agent',
        whatsapp_access_all: false,
        whatsapp_number_ids: [],
        pipeline_access_all: false,
        pipeline_ids: [],
        can_send_messages: true,
        can_transfer_chats: true,
        can_edit_pipeline: false,
      };
    }

    return NextResponse.json({ permissions });
  } catch (error: any) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar ou atualizar permissões
export async function POST(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { agent_id, organization_id, organizationId, ...permissionsData } = body;
    const orgId = organization_id || organizationId;

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    // Verificar se o agente pertence à organização
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .eq('organization_id', orgId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Upsert permissões
    const { data, error } = await supabase
      .from('agent_permissions')
      .upsert({
        agent_id,
        ...permissionsData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ permissions: data });
  } catch (error: any) {
    console.error('Error saving permissions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
