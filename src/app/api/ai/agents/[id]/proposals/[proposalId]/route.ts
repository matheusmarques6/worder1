import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { applyProposal, dismissProposal, listProposals } from '@/lib/ai/proposals'
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
// POST - APLICAR / DISPENSAR UMA PROPOSTA (Bloco F5)
// Aplicar cria uma versão 'produção' via serviço F1 (reuso).
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; proposalId: string } }
) {
  try {
    // ✅ Validar autenticação
    const auth = await getAuthClient()
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { id: agentId, proposalId } = params

    // ✅ Org e autor vêm do usuário autenticado, nunca do cliente
    const organizationId = auth.user.organization_id
    const userId = auth.user.id ?? null

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const action = body?.action
    if (action !== 'apply' && action !== 'dismiss') {
      return NextResponse.json({ error: "action deve ser 'apply' ou 'dismiss'" }, { status: 400 })
    }

    const agent = await loadAgentInOrg(supabase, agentId, organizationId)
    if (!agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // ✅ proposalId é re-validado ∈ (agente, org) dentro do serviço.
    if (action === 'apply') {
      await applyProposal(supabase, agent, organizationId, proposalId, userId)
    } else {
      await dismissProposal(supabase, agentId, organizationId, proposalId)
    }

    // Recarrega o agente (system_prompt pode ter mudado no apply) para o diff fresco.
    const refreshed = action === 'apply' ? await loadAgentInOrg(supabase, agentId, organizationId) : agent
    const proposals = await listProposals(
      supabase,
      agentId,
      organizationId,
      refreshed?.system_prompt ?? agent.system_prompt ?? ''
    )
    return NextResponse.json({ proposals })
  } catch (error: any) {
    if (error?.message === 'Proposta não encontrada') {
      return NextResponse.json({ error: 'Proposta não encontrada' }, { status: 404 })
    }
    console.error('Error in POST /api/ai/agents/[id]/proposals/[proposalId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
