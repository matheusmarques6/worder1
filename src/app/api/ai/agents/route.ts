import { NextRequest, NextResponse } from 'next/server'
import { AIAgent, DEFAULT_PERSONA, DEFAULT_SETTINGS } from '@/lib/ai/types'
import { getAuthClient, authError } from '@/lib/api-utils';

// =====================================================
// GET - LISTAR AGENTES
// =====================================================

export async function GET(request: NextRequest) {
  // Autenticação via RLS
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    // Parâmetros (organization_id vem do usuário autenticado)
    const { searchParams } = new URL(request.url)
    const isActive = searchParams.get('is_active')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Query - RLS filtra automaticamente por organization_id
    let query = supabase
      .from('ai_agents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data: agents, error, count } = await query

    if (error) {
      console.error('Error fetching agents:', error)
      throw error
    }

    return NextResponse.json({
      agents: agents || [],
      total: count || 0,
      limit,
      offset,
    })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// POST - CRIAR AGENTE
// =====================================================

export async function POST(request: NextRequest) {
  // Autenticação via RLS
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const body = await request.json()

    // Validação
    const { name, provider, model } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    // Preparar dados - organization_id vem do usuário autenticado
    const agentData = {
      organization_id: user.organization_id,
      name: name.trim(),
      description: body.description?.trim() || null,
      system_prompt: body.system_prompt?.trim() || null,
      provider: provider || 'openai',
      model: model || 'gpt-4o-mini',
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 500,
      is_active: body.is_active ?? false,
      persona: {
        ...DEFAULT_PERSONA,
        ...(body.persona || {}),
      },
      settings: {
        ...DEFAULT_SETTINGS,
        ...(body.settings || {}),
      },
      total_messages: 0,
      total_conversations: 0,
      total_tokens_used: 0,
      avg_response_time_ms: 0,
    }

    // Inserir
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .insert(agentData)
      .select()
      .single()

    if (error) {
      console.error('Error creating agent:', error)
      throw error
    }

    return NextResponse.json({ agent }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
