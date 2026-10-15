import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Plano IA M2 passo 16 — a barra de consumo da área "Motor e custo": o gasto
// do mês DESTE agente, lido de ai_usage_logs (espelho de internal.llm_calls
// pelo trigger; inclui o legado). NULL em cost_usd = custo desconhecido, e a
// soma vira um piso — `has_unknown_cost` diz isso à UI.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id

  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id, monthly_cap_usd')
    .eq('id', params.id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: rows, error } = await supabase
    .from('ai_usage_logs')
    .select('cost_usd')
    .eq('organization_id', organizationId)
    .eq('agent_id', params.id)
    .gte('created_at', monthStart.toISOString())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let spent = 0
  let hasUnknown = false
  for (const row of rows ?? []) {
    if (row.cost_usd === null || row.cost_usd === undefined) hasUnknown = true
    else spent += Number(row.cost_usd) || 0
  }
  return NextResponse.json({
    month_start: monthStart.toISOString(),
    spent_usd: Number(spent.toFixed(4)),
    has_unknown_cost: hasUnknown,
    cap_usd: agent.monthly_cap_usd === null ? null : Number(agent.monthly_cap_usd),
    calls: rows?.length ?? 0,
  })
}
