import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import {
  listScenariosWithLatestRun,
  runScenarios,
  generateScenarios,
} from '@/lib/ai/test-runner'
import type { AIAgent } from '@/lib/ai/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Carrega o agente garantindo que pertence à org autenticada (assertAgentInOrg). */
async function loadAgentInOrg(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  agentId: string,
  organizationId: string
): Promise<AIAgent | null> {
  const { data, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .single()
  if (error || !data) return null
  return data as AIAgent
}

// =====================================================
// GET - CENÁRIOS COM ÚLTIMO RUN (Bloco F3)
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ Validar autenticação (espelha o padrão endurecido de annotations/route.ts)
    const auth = await getAuthClient()
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const agentId = params.id

    // ✅ Escopo de org vem SEMPRE do usuário autenticado, nunca do cliente
    const organizationId = auth.user.organization_id

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    const agent = await loadAgentInOrg(supabase, agentId, organizationId)
    if (!agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    const scenarios = await listScenariosWithLatestRun(supabase, agentId, organizationId)
    return NextResponse.json({ scenarios })
  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/test-runs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// POST - SEMEAR (se vazio) + EXECUTAR CENÁRIOS (Bloco F3)
// Long-running: tudo bem (force-dynamic / nodejs). Cap de 10 cenários/run.
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ Validar autenticação
    const auth = await getAuthClient()
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const agentId = params.id

    // ✅ Org e autor vêm do usuário autenticado, nunca do cliente
    const organizationId = auth.user.organization_id
    const userId = auth.user.id ?? null

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    const agent = await loadAgentInOrg(supabase, agentId, organizationId)
    if (!agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const rawIds = Array.isArray(body?.scenario_ids) ? body.scenario_ids : null
    const scenarioIds: string[] | 'all' = rawIds
      ? rawIds.filter((id: any) => typeof id === 'string' && id)
      : 'all'

    // Semeia 4 cenários quando o agente ainda não tem nenhum (1 chamada LLM).
    const { count } = await supabase
      .from('ai_test_scenarios')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)

    if ((count ?? 0) === 0) {
      await generateScenarios(supabase, agent, organizationId, userId)
    }

    const scenarios = await runScenarios(supabase, agent, organizationId, scenarioIds, userId)
    return NextResponse.json({ scenarios })
  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/test-runs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
