import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { diagnose, monthSpend } from '@/lib/ai/block-metrics'
import { hasActiveProviderKey } from '@/lib/ai/provider-key-check'

export const dynamic = 'force-dynamic'

// Plano IA M6 passo 31 — "Diagnosticar" no Construtor: avisos ligados ao nó
// (sem chave, sem missão ativa, cupom autorizado com a ferramenta desligada,
// sem transferência, fonte com erro ou sincronizando, muitas respostas
// retidas em 7 dias, teto mensal acima de 80%).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id, provider, settings, monthly_cap_usd')
    .eq('id', params.id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const provider = agent.provider || 'openai'

  const [hasKey, missions, readers, outcomes, spend] = await Promise.all([
    hasActiveProviderKey(supabase, organizationId, provider),
    supabase.from('ai_missions').select('id, event_type, concession').eq('organization_id', organizationId).eq('agent_id', params.id).eq('status', 'active'),
    supabase.from('ai_source_agents').select('source_id').eq('organization_id', organizationId).eq('agent_id', params.id),
    supabase.from('ai_conversation_outcomes').select('blocked_count').eq('organization_id', organizationId).eq('agent_id', params.id).gte('started_at', weekAgo).limit(5000),
    supabase.from('ai_usage_logs').select('cost_usd').eq('organization_id', organizationId).eq('agent_id', params.id).gte('created_at', monthStart.toISOString()).limit(20000),
  ])
  const sourceIds = (readers.data ?? []).map((r: any) => r.source_id)
  const { data: sources } = sourceIds.length
    ? await supabase.from('ai_sources').select('id, name, status').eq('organization_id', organizationId).in('id', sourceIds)
    : { data: [] as Array<{ id: string; name: string; status: string | null }> }

  const settings = (agent.settings ?? {}) as Record<string, any>
  const diagnostics = diagnose({
    hasProviderKey: hasKey,
    provider,
    activeMissions: (missions.data ?? []) as any,
    enabledTools: Array.isArray(settings.tools?.enabled) ? settings.tools.enabled : [],
    handoffKeywords: Array.isArray(settings.safety?.handoff_keywords) ? settings.safety.handoff_keywords : [],
    sources: (sources ?? []) as any,
    blocked7d: (outcomes.data ?? []).reduce((s: number, r: any) => s + (r.blocked_count || 0), 0),
    monthlyCapUsd: agent.monthly_cap_usd === null || agent.monthly_cap_usd === undefined ? null : Number(agent.monthly_cap_usd),
    monthSpendUsd: monthSpend(spend.data ?? []),
  })
  return NextResponse.json({ diagnostics })
}
