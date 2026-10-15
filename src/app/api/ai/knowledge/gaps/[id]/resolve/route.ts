import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { GAP_ACTIONS, appendAnswer, noteFromGap } from '@/lib/ai/knowledge/notes'
import { ownAgentIds, setReaders } from '@/lib/ai/knowledge/server'
import { extractLinks } from '@/lib/ai/processors/markdown-processor'
import { triggerSourceProcessing } from '@/lib/ai/knowledge/process-trigger'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — resolver uma lacuna:
//   create_source { answer, name?, folder?, agent_ids? } → nota nova lida
//     pelos agentes (padrão: os da lacuna);
//   append_to     { source_id, answer } → resposta pronta no fim da nota;
//   add_limit     { text?, agent_ids? } → assunto bloqueado nos agentes;
//   ignore        → some por 30 dias.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const action = body?.action
  if (!(GAP_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `action deve ser ${GAP_ACTIONS.join(' | ')}` }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const { data: gap } = await supabase
    .from('ai_knowledge_gaps').select('*').eq('id', params.id).eq('organization_id', organizationId).maybeSingle()
  if (!gap) return NextResponse.json({ error: 'Lacuna não encontrada' }, { status: 404 })

  const answer = typeof body?.answer === 'string' ? body.answer.trim() : (gap.suggested_answer ?? '').trim()
  const close = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from('ai_knowledge_gaps')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), ...patch })
      .eq('id', gap.id)
      .eq('organization_id', organizationId)
    if (error) throw new Error(error.message)
  }

  try {
    if (action === 'ignore') {
      const until = new Date(Date.now() + 30 * 86_400_000).toISOString()
      const { error } = await supabase
        .from('ai_knowledge_gaps')
        .update({ status: 'ignored_until', ignored_until: until })
        .eq('id', gap.id)
        .eq('organization_id', organizationId)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, status: 'ignored_until', ignored_until: until })
    }

    if (action === 'create_source') {
      if (!answer) return NextResponse.json({ error: 'answer é obrigatório' }, { status: 400 })
      const readers = body?.agent_ids === undefined
        ? (gap.agent_ids ?? [])
        : await ownAgentIds(supabase, organizationId, body.agent_ids)
      if (readers === null) return NextResponse.json({ error: 'agent_ids com agente de outra organização' }, { status: 400 })
      const markdown = noteFromGap(gap.question, answer)
      const { data: note, error } = await supabase
        .from('ai_sources')
        .insert({
          organization_id: organizationId, source_type: 'text', kind: 'note',
          name: (typeof body?.name === 'string' && body.name.trim()) || gap.question.slice(0, 120),
          folder: (typeof body?.folder === 'string' && body.folder.trim()) || 'lacunas',
          body_markdown: markdown, text_content: markdown, links: extractLinks(markdown),
          status: 'pending', chunks_count: 0, updated_by: auth.user.id,
        })
        .select('id, name')
        .single()
      if (error) throw new Error(error.message)
      await setReaders(supabase, organizationId, note.id, readers)
      await close({ linked_source_id: note.id, suggested_answer: answer })
      triggerSourceProcessing(note.id, organizationId).catch((e) => console.error('Error processing gap note:', e))
      return NextResponse.json({ ok: true, status: 'resolved', source: note }, { status: 201 })
    }

    if (action === 'append_to') {
      if (!answer || typeof body?.source_id !== 'string') {
        return NextResponse.json({ error: 'source_id e answer são obrigatórios' }, { status: 400 })
      }
      const { data: note } = await supabase
        .from('ai_sources').select('id, body_markdown, read_only')
        .eq('id', body.source_id).eq('organization_id', organizationId).maybeSingle()
      if (!note) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })
      if (note.read_only) return NextResponse.json({ error: 'Fonte sincronizada é somente leitura' }, { status: 409 })
      const markdown = appendAnswer(note.body_markdown, gap.question, answer)
      const { error } = await supabase
        .from('ai_sources')
        .update({ body_markdown: markdown, text_content: markdown, links: extractLinks(markdown), status: 'pending', updated_by: auth.user.id })
        .eq('id', note.id).eq('organization_id', organizationId)
      if (error) throw new Error(error.message)
      await close({ linked_source_id: note.id, suggested_answer: answer })
      triggerSourceProcessing(note.id, organizationId).catch((e) => console.error('Error reprocessing note:', e))
      return NextResponse.json({ ok: true, status: 'resolved', source_id: note.id })
    }

    // add_limit — tema sensível: o agente não deve responder, e sim transferir.
    const text = (typeof body?.text === 'string' && body.text.trim()) || gap.question.trim()
    const agentIds = body?.agent_ids === undefined
      ? (gap.agent_ids ?? [])
      : await ownAgentIds(supabase, organizationId, body.agent_ids)
    if (agentIds === null) return NextResponse.json({ error: 'agent_ids com agente de outra organização' }, { status: 400 })
    if (agentIds.length === 0) return NextResponse.json({ error: 'Escolha ao menos um agente' }, { status: 400 })
    const { data: agents, error: readError } = await supabase
      .from('ai_agents').select('id, settings').eq('organization_id', organizationId).in('id', agentIds)
    if (readError) throw new Error(readError.message)
    for (const agent of agents ?? []) {
      const settings = { ...(agent.settings ?? {}) }
      const safety = { ...(settings.safety ?? {}) }
      const blocked: string[] = Array.isArray(safety.blocked_topics) ? safety.blocked_topics : []
      if (!blocked.includes(text)) safety.blocked_topics = [...blocked, text]
      settings.safety = safety
      const { error } = await supabase
        .from('ai_agents').update({ settings, updated_at: new Date().toISOString() })
        .eq('id', agent.id).eq('organization_id', organizationId)
      if (error) throw new Error(error.message)
    }
    await close({ suggested_kind: 'limit' })
    return NextResponse.json({ ok: true, status: 'resolved', limited_agents: (agents ?? []).length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
