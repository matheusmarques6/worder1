import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { EVENT_FAMILIES, pickEditableMissionFields } from '@/lib/ai/missions'

export const dynamic = 'force-dynamic'

// GET /api/ai/missions — o catálogo da org, agrupável por família na UI.
// ?agent_id= filtra as missões DESTE agente (plano IA M2 passo 15).
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const agentId = new URL(request.url).searchParams.get('agent_id')
  let query = getSupabaseAdmin()
    .from('ai_missions')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .order('event_type', { ascending: true })
    .order('created_at', { ascending: false })
  if (agentId) query = query.eq('agent_id', agentId)
  const [{ data, error }, agents] = await Promise.all([
    query,
    // Passo 17: o nó de fluxo mostra o agente dono da missão sem precisar
    // de outra rota — a lista curta de agentes vem junto.
    getSupabaseAdmin()
      .from('ai_agents')
      .select('id, name, role, status')
      .eq('organization_id', auth.user.organization_id)
      .order('created_at', { ascending: true }),
  ])

  if (error) {
    console.error('Error fetching missions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ missions: data ?? [], families: EVENT_FAMILIES, agents: agents.data ?? [] })
}

// POST /api/ai/missions — nova versão (sempre draft; ativar é ato explícito).
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.event_type || !body?.objective) {
    return NextResponse.json(
      { error: 'event_type e objective são obrigatórios' },
      { status: 400 }
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('ai_missions')
    .insert({
      organization_id: auth.user.organization_id,
      event_type: String(body.event_type),
      origin: 'lojista',
      status: 'draft',
      agent_id: typeof body.agent_id === 'string' && body.agent_id ? body.agent_id : null,
      parent_version_id: body.parent_version_id ?? null,
      ...pickEditableMissionFields(body),
      objective: String(body.objective),
    })
    .select('*')
    .single()

  if (error) {
    console.error('Error creating mission:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ mission: data }, { status: 201 })
}
