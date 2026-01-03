import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

// =====================================================
// GET - LISTAR AÇÕES DO AGENTE
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const agentId = params.id

    // Buscar ações - RLS filtra automaticamente
    const { data: actions, error } = await supabase
      .from('ai_agent_actions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching actions:', error)
      throw error
    }

    return NextResponse.json({ actions: actions || [] })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/actions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// POST - CRIAR AÇÃO
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const agentId = params.id
    const body = await request.json()

    const { name, conditions, actions: actionsList } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    // Verificar se agente existe
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Preparar dados
    const actionData = {
      organization_id: user.organization_id,
      agent_id: agentId,
      name: name.trim(),
      description: body.description?.trim() || null,
      action_type: body.action_type || 'custom',
      trigger_keywords: body.trigger_keywords || [],
      conditions: conditions || {},
      actions: actionsList || [],
      is_active: body.is_active ?? true,
      priority: body.priority ?? 0,
    }

    const { data: action, error } = await supabase
      .from('ai_agent_actions')
      .insert(actionData)
      .select()
      .single()

    if (error) {
      console.error('Error creating action:', error)
      throw error
    }

    return NextResponse.json({ action }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/actions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
