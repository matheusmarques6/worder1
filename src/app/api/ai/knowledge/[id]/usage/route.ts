import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { usageByDay } from '@/lib/ai/knowledge/notes'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — uso de uma nota nos últimos 7 dias, das chamadas
// search_knowledge do runtime (ai_runtime_activity_tools; o source_id está
// em output.chunks desde a alteração 2026-10-15-05), mais as perguntas que
// ela ajudou a responder (com agente e data).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const { data: note } = await supabase
    .from('ai_sources').select('id').eq('id', params.id).eq('organization_id', organizationId).maybeSingle()
  if (!note) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: calls, error } = await supabase
    .from('ai_runtime_activity_tools')
    .select('conversation_id, input, output, created_at')
    .eq('organization_id', organizationId)
    .eq('tool_name', 'search_knowledge')
    .eq('success', true)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const usage = usageByDay(calls ?? [], note.id, new Date())
  const questions = (calls ?? [])
    .filter((c: any) => Array.isArray(c.output?.chunks) && c.output.chunks.some((ch: any) => ch?.source_id === note.id))
    .slice(0, 20)
    .map((c: any) => ({ question: c.input?.query ?? null, conversation_id: c.conversation_id, at: c.created_at }))

  let agentByConversation = new Map<string, string | null>()
  const ids = [...new Set(questions.map((q) => q.conversation_id).filter(Boolean))] as string[]
  if (ids.length > 0) {
    const { data: convs } = await supabase
      .from('ai_runtime_activity')
      .select('conversation_id, agent_name')
      .eq('organization_id', organizationId)
      .in('conversation_id', ids)
    agentByConversation = new Map((convs ?? []).map((c: any) => [c.conversation_id, c.agent_name]))
  }
  return NextResponse.json({
    series: usage.series,
    total: usage.total,
    conversations: usage.conversations.length,
    questions: questions.map((q) => ({ ...q, agent_name: q.conversation_id ? agentByConversation.get(q.conversation_id) ?? null : null })),
  })
}
