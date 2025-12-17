import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  return data?.organization_id;
}

// GET - Lista agentes
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const includeStats = request.nextUrl.searchParams.get('include_stats') === 'true';

    const { data, error } = await supabase
      .from('whatsapp_agents')
      .select('*, user:profiles(first_name, last_name, avatar_url)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    let agents = data || [];

    if (includeStats) {
      for (const agent of agents) {
        const { count: active } = await supabase
          .from('whatsapp_agent_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('agent_id', agent.id)
          .eq('status', 'active');

        const { count: resolved } = await supabase
          .from('whatsapp_agent_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('agent_id', agent.id)
          .eq('status', 'resolved');

        agent.stats = { active_chats: active || 0, resolved_chats: resolved || 0 };
      }
    }

    return NextResponse.json({ agents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar agente ou atribuir chat
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { action } = body;

    if (action === 'assign') {
      const { conversation_id, agent_id } = body;
      if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });

      if (!agent_id) {
        // Remover atribuição
        await supabase.from('whatsapp_agent_assignments').delete().eq('conversation_id', conversation_id);
        await supabase.from('whatsapp_conversations').update({ assigned_agent_id: null }).eq('id', conversation_id);
        return NextResponse.json({ success: true, message: 'Assignment removed' });
      }

      // Verificar agente
      const { data: agent } = await supabase
        .from('whatsapp_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .single();

      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

      // Criar/atualizar atribuição
      await supabase.from('whatsapp_agent_assignments').upsert({
        organization_id: orgId,
        agent_id,
        conversation_id,
        status: 'active',
        assigned_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' });

      await supabase.from('whatsapp_conversations').update({ assigned_agent_id: agent_id }).eq('id', conversation_id);

      return NextResponse.json({ success: true });
    }

    if (action === 'resolve') {
      const { conversation_id } = body;
      await supabase.from('whatsapp_agent_assignments').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('conversation_id', conversation_id);
      await supabase.from('whatsapp_conversations').update({ status: 'closed' }).eq('id', conversation_id);
      return NextResponse.json({ success: true });
    }

    // Criar agente
    const { user_id, name, email, role = 'agent' } = body;
    if (!name || !email) return NextResponse.json({ error: 'name and email required' }, { status: 400 });

    const { data: existing } = await supabase
      .from('whatsapp_agents')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', email)
      .single();

    if (existing) return NextResponse.json({ error: 'Agent already exists' }, { status: 409 });

    const { data, error } = await supabase
      .from('whatsapp_agents')
      .insert({ organization_id: orgId, user_id, name, email, role, is_active: true })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar agente
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updateData } = body;
    if (!id) return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });

    const allowed = ['name', 'email', 'role', 'is_active', 'is_available', 'max_concurrent_chats'];
    const filtered: any = {};
    allowed.forEach(f => { if (f in updateData) filtered[f] = updateData[f]; });

    const { data, error } = await supabase
      .from('whatsapp_agents')
      .update({ ...filtered, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ agent: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Deletar agente
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });

    // Verificar chats ativos
    const { count } = await supabase
      .from('whatsapp_agent_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id)
      .eq('status', 'active');

    if (count && count > 0) {
      return NextResponse.json({ error: 'Agent has active chats' }, { status: 400 });
    }

    await supabase.from('whatsapp_agent_assignments').delete().eq('agent_id', id);
    await supabase.from('whatsapp_conversations').update({ assigned_agent_id: null }).eq('assigned_agent_id', id);
    await supabase.from('whatsapp_agents').delete().eq('id', id).eq('organization_id', orgId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
