import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/ai/missions/seed — cria as 6 missões padrão da org como RASCUNHO
// (seed_default_missions, migration 0010: idempotente — família que já tem
// versão não ganha outra). Ativar continua sendo ato explícito, missão a
// missão (D12): o seed nunca liga nada sozinho.
// Com {agent_id} (plano IA M2 passo 15) as missões nascem ligadas ao agente;
// sem ele, ao agente ativo da org (overload de um argumento, 20261016000008).
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const organizationId = auth.user.organization_id
  if (!organizationId) {
    return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const agentId = typeof body?.agent_id === 'string' && body.agent_id ? body.agent_id : null
  const { data, error } = await getSupabaseAdmin().rpc(
    'seed_default_missions',
    agentId
      ? { p_organization_id: organizationId, p_agent_id: agentId }
      : { p_organization_id: organizationId },
  )
  if (error) {
    console.error('Error seeding missions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ created: data ?? 0 })
}
