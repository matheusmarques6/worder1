import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  return data?.organization_id;
}

// GET - Lista ou busca flow específico
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');

    if (id) {
      const { data, error } = await supabase
        .from('whatsapp_flows')
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId)
        .single();

      if (error || !data) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
      return NextResponse.json({ flow: data });
    }

    const { data, error } = await supabase
      .from('whatsapp_flows')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ flows: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar flow
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, description, nodes = [], edges = [], trigger_keywords = [] } = body;

    if (!name) return NextResponse.json({ error: 'Flow name required' }, { status: 400 });

    const flowId = `flow_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Criar nó inicial se não existir
    let finalNodes = nodes;
    if (nodes.length === 0) {
      finalNodes = [{
        id: 'start_1',
        type: 'START',
        position: { x: 250, y: 50 },
        data: { label: 'Início', isStart: true }
      }];
    }

    const { data, error } = await supabase
      .from('whatsapp_flows')
      .insert({
        organization_id: orgId,
        flow_id: flowId,
        name,
        description,
        nodes: finalNodes,
        edges,
        trigger_keywords,
        is_active: false,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ flow: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar flow
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) return NextResponse.json({ error: 'Flow ID required' }, { status: 400 });

    const allowed = ['name', 'description', 'nodes', 'edges', 'is_active', 'trigger_keywords', 'variables'];
    const filtered: any = {};
    allowed.forEach(f => { if (f in updateData) filtered[f] = updateData[f]; });

    // Validar nodes se estiver atualizando
    if (filtered.nodes) {
      const nodes = filtered.nodes;
      const startNode = nodes.find((n: any) => n.type === 'START' || n.data?.isStart);
      if (!startNode && nodes.length > 0) {
        return NextResponse.json({ error: 'Flow must have a start node' }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('whatsapp_flows')
      .update({ ...filtered, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ flow: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Deletar flow
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Flow ID required' }, { status: 400 });

    // Verificar se está em uso por chatbot
    const { data: chatbots } = await supabase
      .from('whatsapp_chatbots')
      .select('id')
      .eq('flow_id', id)
      .limit(1);

    if (chatbots && chatbots.length > 0) {
      return NextResponse.json({ error: 'Flow in use by a chatbot' }, { status: 400 });
    }

    // Deletar sessões
    await supabase.from('whatsapp_flow_sessions').delete().eq('flow_id', id);
    
    // Deletar flow
    await supabase.from('whatsapp_flows').delete().eq('id', id).eq('organization_id', orgId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
