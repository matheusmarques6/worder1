import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { faqMarkdown, noteMarkdown, qaRowsFromCsv } from '@/lib/ai/knowledge/csv'
import { triggerSourceProcessing } from '@/lib/ai/knowledge/process-trigger'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 19 — importar CSV de perguntas e respostas.
// Body: { csv, mode: 'faq' | 'notes', name?, folder?, agent_ids?: string[] }.
// 'faq' = uma nota só (kind faq) com uma seção por pergunta; 'notes' = uma
// nota por linha. As notas nascem em ai_sources (sem agent_id) lidas pelos
// agentes de agent_ids, e o processamento (chunks tipados + embeddings) roda
// pelo mesmo endpoint interno das outras fontes.
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const csv = typeof body?.csv === 'string' ? body.csv : ''
  const mode = body?.mode === 'notes' ? 'notes' : 'faq'
  if (!csv.trim()) return NextResponse.json({ error: 'csv é obrigatório' }, { status: 400 })
  if (csv.length > 500_000) return NextResponse.json({ error: 'csv excede 500 KB' }, { status: 400 })

  const rows = qaRowsFromCsv(csv)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nenhuma linha com pergunta e resposta' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const folder = typeof body?.folder === 'string' && body.folder.trim() ? body.folder.trim() : 'faq'
  const agentIds: string[] = Array.isArray(body?.agent_ids) ? body.agent_ids.filter((x: unknown) => typeof x === 'string') : []
  if (agentIds.length > 0) {
    const { data: owned } = await supabase.from('ai_agents').select('id').eq('organization_id', organizationId).in('id', agentIds)
    if ((owned?.length ?? 0) !== agentIds.length) {
      return NextResponse.json({ error: 'agent_ids com agente de outra organização' }, { status: 400 })
    }
  }

  const notes = mode === 'faq'
    ? [{ name: (typeof body?.name === 'string' && body.name.trim()) || 'Perguntas frequentes', kind: 'faq', body_markdown: faqMarkdown(rows) }]
    : rows.map((r) => ({ name: r.question.slice(0, 120), kind: 'note', body_markdown: noteMarkdown(r) }))

  const { data: created, error } = await supabase
    .from('ai_sources')
    .insert(notes.map((n) => ({
      organization_id: organizationId,
      source_type: 'text',
      name: n.name,
      kind: n.kind,
      folder,
      body_markdown: n.body_markdown,
      text_content: n.body_markdown,
      status: 'pending',
      chunks_count: 0,
      updated_by: auth.user.id ?? null,
    })))
    .select('id, name, kind')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sources = created ?? []
  if (agentIds.length > 0 && sources.length > 0) {
    const links = sources.flatMap((s) => agentIds.map((agentId) => ({ source_id: s.id, agent_id: agentId, organization_id: organizationId })))
    const { error: linkError } = await supabase.from('ai_source_agents').insert(links)
    if (linkError) console.error('Error linking imported sources to agents:', linkError)
  }

  // Processamento em background, uma fonte por vez (embeddings pagos).
  void (async () => {
    for (const s of sources) {
      try { await triggerSourceProcessing(s.id, organizationId) }
      catch (e) { console.error(`Error processing imported source ${s.id}:`, e) }
    }
  })()

  return NextResponse.json({ imported: sources.length, rows: rows.length, mode, sources }, { status: 201 })
}
