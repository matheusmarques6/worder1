import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 10.1 — um agente por loja. O canônico é O agente ativo da org (o resolver
// do runtime já assume isso: a versão em produção do agente ativo). GET
// devolve o estado; org com N ativos devolve canonical=null e a UI abre a
// tela única de escolha. POST {agent_id} escolhe: o eleito fica ativo, os
// demais viram arquivados (is_active=false — somente leitura, restauráveis
// escolhendo de novo).

export async function GET() {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const organizationId = auth.user.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    const { data, error } = await getSupabaseAdmin()
      .from('ai_agents')
      .select(
        'id, name, model, provider, is_active, presentation_mode, client_adaptation, persona, settings, created_at'
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)

    const agents = data ?? []
    const active = agents.filter((a) => a.is_active)
    const canonical =
      active.length === 1 ? active[0] : agents.length === 1 ? agents[0] : null

    return NextResponse.json({
      agents: agents.map(({ id, name, model, is_active, created_at }) => ({
        id, name, model, is_active, created_at,
      })),
      canonical,
      needsChoice: canonical === null && agents.length > 1,
    })
  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/canonical:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const organizationId = auth.user.organization_id

    const body = await request.json().catch(() => null)
    if (!body?.agent_id) {
      return NextResponse.json({ error: 'agent_id é obrigatório' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: chosen, error: findError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', body.agent_id)
      .eq('organization_id', organizationId)
      .single()
    if (findError || !chosen) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Arquiva os demais primeiro; se morrermos no meio, a org fica sem ativo
    // (estado seguro — nada responde) em vez de com dois canônicos.
    const { error: archiveError } = await supabase
      .from('ai_agents')
      .update({ is_active: false })
      .eq('organization_id', organizationId)
      .neq('id', body.agent_id)
    if (archiveError) throw new Error(archiveError.message)

    const { error: activateError } = await supabase
      .from('ai_agents')
      .update({ is_active: true })
      .eq('id', body.agent_id)
      .eq('organization_id', organizationId)
    if (activateError) throw new Error(activateError.message)

    return NextResponse.json({ ok: true, canonical_id: body.agent_id })
  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/canonical:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
