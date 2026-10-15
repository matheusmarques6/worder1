import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { blockMetrics, type ToolCallRow } from '@/lib/ai/block-metrics'
import { periodWindow } from '@/lib/ai/activity-summary'
import { loadOutcomes } from '@/lib/ai/activity-data'
import { listEntries } from '@/lib/ai/agent-entries'
import { loadFlowTouchEntries } from '@/lib/ai/flow-touches'

export const dynamic = 'force-dynamic'

// Plano IA M6 passo 31 — os números de cada bloco do Construtor:
// ?period=7d|30d (padrão 7d).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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
    const [calls, readers, entries, touches] = await Promise.all([
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
    ])
    const sourceIds = (readers.data ?? []).map((r: any) => r.source_id)
    const { data: sources } = sourceIds.length
      ? await supabase.from('ai_sources').select('id, name').eq('organization_id', organizationId).in('id', sourceIds)
      : { data: [] as Array<{ id: string; name: string }> }
    return NextResponse.json({
      period: { days, start: window.start.toISOString() },
      ...blockMetrics({
        outcomes,
        toolCalls: ((calls as any).data ?? []) as ToolCallRow[],
        sources: (sources ?? []) as Array<{ id: string; name: string }>,
        entries: [...entries, ...touches.filter((t) => t.agent_id === params.id)],
      }),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
