import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  return getSupabaseAdmin();
}

const MAX_ACTIONS_PER_AGENT = 20

// =====================================================
// GET - LISTAR AÇÕES DO AGENTE
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const agentId = params.id

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Buscar ações ordenadas por prioridade
    const { data: actions, error } = await supabase
      .from('ai_agent_actions')
      .select('*')
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching actions:', error)
      throw error
    }

    return NextResponse.json({
      actions: actions || [],
      count: actions?.length || 0,
      max_allowed: MAX_ACTIONS_PER_AGENT,
    })

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
  try {
    const supabase = getSupabase()
    const agentId = params.id
    const body = await request.json()

    const { organization_id, name, conditions, actions: actionsList } = body

    // Validações
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    if (!conditions || !conditions.items || conditions.items.length === 0) {
      return NextResponse.json({ error: 'Pelo menos uma condição é obrigatória' }, { status: 400 })
    }

    if (!actionsList || actionsList.length === 0) {
      return NextResponse.json({ error: 'Pelo menos uma ação é obrigatória' }, { status: 400 })
    }

    // Verificar se agente existe
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Verificar limite de ações
    const { count, error: countError } = await supabase
      .from('ai_agent_actions')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)

    if (countError) throw countError

    if ((count || 0) >= MAX_ACTIONS_PER_AGENT) {
      return NextResponse.json({ 
        error: `Limite de ${MAX_ACTIONS_PER_AGENT} ações por agente atingido` 
      }, { status: 400 })
    }

    // Preparar dados
    const actionData = {
      organization_id,
      agent_id: agentId,
      name: name.trim(),
      description: body.description?.trim() || null,
      is_active: body.is_active ?? true,
      priority: body.priority ?? 0,
      conditions: {
        match_type: conditions.match_type || 'all',
        items: conditions.items.map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          type: item.type,
          intent: item.intent,
          custom_intent: item.custom_intent,
          sentiment: item.sentiment,
          keywords: item.keywords,
          time_range: item.time_range,
          days: item.days,
        })),
      },
      actions: actionsList.map((action: any) => ({
        id: action.id || crypto.randomUUID(),
        type: action.type,
        transfer_to: action.transfer_to,
        agent_id: action.agent_id,
        message: action.message,
        source_id: action.source_id,
        ask_field: action.ask_field,
        custom_field: action.custom_field,
        topic: action.topic,
      })),
      times_triggered: 0,
    }

    // Inserir
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
