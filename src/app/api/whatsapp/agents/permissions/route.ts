import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const agentId = searchParams.get('agentId');

  try {
    if (agentId) {
      const { data, error } = await supabase
        .from('whatsapp_agents')
        .select('permissions')
        .eq('id', agentId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return NextResponse.json({ permissions: data?.permissions || {} });
    }

    const { data, error } = await supabase
      .from('whatsapp_agents')
      .select('id, name, permissions')
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ agents: data || [] });
  } catch (error: any) {
    console.error('Permissions GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  // Verificar se é admin
  if (auth.user.role !== 'admin' && auth.user.role !== 'owner') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { agentId, permissions } = body;

    if (!agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_agents')
      .update({ permissions, updated_at: new Date().toISOString() })
      .eq('id', agentId)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ agent: data });
  } catch (error: any) {
    console.error('Permissions PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
