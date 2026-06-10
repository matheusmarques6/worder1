import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { getReportSummary, listProposals, type ReportPeriod } from '@/lib/ai/proposals'
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

function parsePeriod(raw: string | null): ReportPeriod {
  return raw === '7d' || raw === '90d' ? raw : '30d'
}

// =====================================================
// GET - RELATÓRIO (agregados + distribuição + propostas pendentes) (Bloco F5)
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ Validar autenticação (espelha o padrão endurecido de evals/route.ts)
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

    const period = parsePeriod(request.nextUrl.searchParams.get('period'))
    const { summary, distribution } = await getReportSummary(supabase, agentId, organizationId, period)
    const proposals = await listProposals(supabase, agentId, organizationId, agent.system_prompt ?? '')

    return NextResponse.json({ summary, distribution, proposals })
  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/reports:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
