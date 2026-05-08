import { NextRequest, NextResponse } from 'next/server'
import { decorateLegacyFields, toCanonicalAgentRow } from '@/lib/ai/mappers'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  return getSupabaseAdmin();
}

// =====================================================
// GET - LISTAR AGENTES
// =====================================================

export async function GET(request: NextRequest) {
  try {
    // ✅ CORREÇÃO: Validar autenticação
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabase()

    // Parâmetros
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const isActive = searchParams.get('is_active')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // ✅ CORREÇÃO: Validar organization_id contra o usuário autenticado
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    if (organizationId !== auth.user.organization_id) {
      return NextResponse.json({ error: 'Acesso não autorizado a esta organização' }, { status: 403 })
    }

    // Query — schema canônico usa `status` em vez de `is_active`
    let query = supabase
      .from('ai_agents')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (isActive !== null && isActive !== undefined) {
      query = query.eq('status', isActive === 'true' ? 'published' : 'draft')
    }

    const { data: agents, error, count } = await query

    if (error) {
      console.error('Error fetching agents:', error)
      throw error
    }

    return NextResponse.json({
      agents: (agents || []).map(decorateLegacyFields),
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

    if (!body.organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    // Mapper aceita payload legado (system_prompt/provider/model/...) ou novo
    // (identity/llm_config/...) e devolve sempre o shape canônico do banco.
    const agentData = toCanonicalAgentRow(body)

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .insert(agentData)
      .select()
      .single()

    if (error) {
      console.error('Error creating agent:', error)
      throw error
    }

    return NextResponse.json({ agent: decorateLegacyFields(agent) }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
