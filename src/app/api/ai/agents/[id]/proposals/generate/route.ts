import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { generateProposals, listProposals } from '@/lib/ai/proposals'
import type { AIAgent } from '@/lib/ai/types'
import { AiBudgetExceededError } from '@/lib/ai/budget'

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
// POST - GERAR SUGESTÕES DE PROMPT (1 chamada de LLM, ≤3) (Bloco F5)
// Long-running: tudo bem (force-dynamic / nodejs).
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

    await generateProposals(supabase, agent, organizationId, userId)

    const proposals = await listProposals(supabase, agentId, organizationId, agent.system_prompt ?? '')
    return NextResponse.json({ proposals })
  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/proposals/generate:', error)
    if (error instanceof AiBudgetExceededError) {
      return NextResponse.json({ error: error.message, code: 'AI_BUDGET_EXCEEDED' }, { status: 402 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
