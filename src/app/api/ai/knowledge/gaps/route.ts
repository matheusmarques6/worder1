import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { suggestNoteForGap } from '@/lib/ai/knowledge/notes'
import { ownAgentIds } from '@/lib/ai/knowledge/server'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — lacunas: abertas por padrão (as ignoradas cujo
// prazo venceu voltam a aparecer), filtro por agente, mais recentes primeiro.
// Cada uma vem com `suggested_source` (UI F4): a nota editável onde
// responder, quando alguma fala do assunto ("Responder em …").
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const status = params.get('status') ?? 'open'
  const agentId = params.get('agent_id')
  const now = new Date().toISOString()
  let query = getSupabaseAdmin()
    .from('ai_knowledge_gaps')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .order('last_seen', { ascending: false })
    .limit(100)
  if (status === 'open') query = query.or(`status.eq.open,and(status.eq.ignored_until,ignored_until.lt.${now})`)
  else query = query.eq('status', status)
  if (agentId) query = query.contains('agent_ids', [agentId])
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: notes } = await getSupabaseAdmin()
    .from('ai_sources')
    .select('id, name, folder, tags, body_markdown, read_only')
    .eq('organization_id', auth.user.organization_id)
    .limit(500)
  const gaps = (data ?? []).map((g: any) => {
    const linked = g.linked_source_id ? (notes ?? []).find((n: any) => n.id === g.linked_source_id) : null
    const s = linked ?? suggestNoteForGap(g.question ?? '', notes ?? [])
    return { ...g, suggested_source: s ? { id: s.id, name: s.name, folder: s.folder } : null }
  })
  return NextResponse.json({ gaps })
}

// POST — o Testar do Conhecimento não achou resposta e o lojista manda a
// pergunta para as lacunas { question, agent_id }.
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 500) : ''
  if (!question) return NextResponse.json({ error: 'question é obrigatório' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const agentIds = await ownAgentIds(supabase, organizationId, body?.agent_id ? [body.agent_id] : [])
  if (agentIds === null) return NextResponse.json({ error: 'agente de outra organização' }, { status: 400 })
  const { data, error } = await supabase
    .from('ai_knowledge_gaps')
    .insert({ organization_id: organizationId, question, agent_ids: agentIds, outcome: 'no_source', count: 1 })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gap: data }, { status: 201 })
}
