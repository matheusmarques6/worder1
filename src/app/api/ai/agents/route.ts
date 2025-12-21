import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AIAgent, DEFAULT_PERSONA, DEFAULT_SETTINGS } from '@/lib/ai/types'

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase não configurado')
  }

  return createClient(url, key)
}

// =====================================================
// GET - LISTAR AGENTES
// =====================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()

    // Parâmetros
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const isActive = searchParams.get('is_active')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Query
    let query = supabase
      .from('ai_agents')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
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
  try {
    const supabase = getSupabase()
    const body = await request.json()

    // Validação
    const { organization_id, name, provider, model } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    // Preparar dados
    const agentData = {
      organization_id,
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
