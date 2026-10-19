import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { blockMetrics, type ToolCallRow } from '@/lib/ai/block-metrics'
import { periodWindow } from '@/lib/ai/activity-summary'
import { loadOutcomes } from '@/lib/ai/activity-data'
import { listEntries } from '@/lib/ai/agent-entries'
import { loadFlowTouchEntries } from '@/lib/ai/flow-touches'
import { usdToBrl, usdToBrlRate } from '@/lib/ai/brl'

export const dynamic = 'force-dynamic'

// Plano IA M6 passo 31 — os números de cada bloco do Construtor:
// ?period=7d|30d (padrão 7d).
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const { data: agent } = await supabase
    .from('ai_agents').select('id').eq('id', params.id).eq('organization_id', organizationId).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

  const days = new URL(request.url).searchParams.get('period') === '30d' ? 30 : 7
  const window = periodWindow(days, new Date())
  try {
    const outcomes = await loadOutcomes(supabase, organizationId, window.start, params.id)
    const conversationIds = outcomes.map((o) => o.conversation_id)
    const [calls, readers, entries, touches, usdBrl, version] = await Promise.all([
      conversationIds.length
        ? supabase
            .from('ai_runtime_activity_tools')
            .select('tool_name, success, output, conversation_id')
            .eq('organization_id', organizationId)
            .in('conversation_id', conversationIds.slice(0, 1000))
            .gte('created_at', window.start.toISOString())
            .limit(5000)
        : Promise.resolve({ data: [] as ToolCallRow[] }),
      supabase.from('ai_source_agents').select('source_id').eq('organization_id', organizationId).eq('agent_id', params.id),
      listEntries(supabase, organizationId, [params.id]),
      loadFlowTouchEntries(supabase, organizationId).catch(() => []),
      usdToBrlRate(supabase),
      // "avaliação" do bloco do agente: nota da versão em produção (passo 26).
      supabase.from('ai_agent_versions').select('eval_score').eq('organization_id', organizationId)
        .eq('agent_id', params.id).eq('status', 'produção').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const sourceIds = (readers.data ?? []).map((r: any) => r.source_id)
    const { data: sources } = sourceIds.length
      ? await supabase.from('ai_sources').select('id, name').eq('organization_id', organizationId).in('id', sourceIds)
      : { data: [] as Array<{ id: string; name: string }> }
    const m = blockMetrics({
      outcomes,
      toolCalls: ((calls as any).data ?? []) as ToolCallRow[],
      sources: (sources ?? []) as Array<{ id: string; name: string }>,
      entries: [...entries, ...touches.filter((t) => t.agent_id === params.id)],
    })
    const score = (version as any)?.data?.eval_score
    return NextResponse.json({
      period: { days, start: window.start.toISOString() },
      usd_brl: usdBrl,
      ...m,
      // O Construtor mostra dinheiro em R$ (custo de LLM chega em US$).
      agent: {
        ...m.agent,
        cost_brl: usdToBrl(m.agent.cost_usd, usdBrl),
        cost_per_conversation_brl: usdToBrl(m.agent.cost_per_conversation, usdBrl),
        eval_score: score === null || score === undefined ? null : Number(score),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
