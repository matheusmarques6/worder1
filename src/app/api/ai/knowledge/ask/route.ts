import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { resolveEmbeddingKey } from '@/lib/ai/embedding-key'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — "Testar: perguntar a um agente". Só recuperação
// (embedding + busca), SEM LLM: devolve o melhor trecho, a nota de origem e
// se bateu numa regra ou resposta pronta. Mesma RPC que o agente usa
// (search_agent_knowledge, filtrada pelo que ele lê, peso em "resposta").
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  const agentId = typeof body?.agent_id === 'string' ? body.agent_id : ''
  if (!question || !agentId) return NextResponse.json({ error: 'agent_id e question são obrigatórios' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const { data: agent } = await supabase
    .from('ai_agents').select('id, name').eq('id', agentId).eq('organization_id', organizationId).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

  const key = await resolveEmbeddingKey(supabase, organizationId)
  if (!key) {
    return NextResponse.json({ error: 'Cadastre uma chave OpenAI para buscar no conhecimento' }, { status: 422 })
  }
  let embedding: number[]
  try {
    embedding = await generateEmbedding(question, key, organizationId)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }

  const { data, error } = await supabase.rpc('search_agent_knowledge', {
    p_agent_id: agentId,
    p_organization_id: organizationId,
    p_query_embedding: `[${embedding.join(',')}]`,
    p_match_threshold: 0.7,
    p_match_count: 3,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const matches = (data ?? []) as Array<{ chunk_id: string; source_id: string; content: string; metadata: any; similarity: number }>
  if (matches.length === 0) {
    return NextResponse.json({ answered: false, agent: agent.name, best: null, others: [] })
  }
  const ids = [...new Set(matches.map((m) => m.source_id))]
  const { data: sources } = await supabase.from('ai_sources').select('id, name').in('id', ids).eq('organization_id', organizationId)
  const names = new Map((sources ?? []).map((s: any) => [s.id, s.name]))
  const shape = (m: (typeof matches)[number]) => ({
    content: m.content,
    source_id: m.source_id,
    source_name: names.get(m.source_id) ?? null,
    chunk_kind: m.metadata?.chunk_kind ?? 'text',
    similarity: Math.round(m.similarity * 1000) / 1000,
  })
  const best = shape(matches[0])
  return NextResponse.json({
    answered: true,
    agent: agent.name,
    best,
    hit_rule: matches.some((m) => m.metadata?.chunk_kind === 'regra'),
    hit_answer: best.chunk_kind === 'resposta',
    others: matches.slice(1).map(shape),
  })
}
