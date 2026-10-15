import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { buildTree } from '@/lib/ai/knowledge/notes'
import { NOTE_COLUMNS, ownAgentIds, readersBySource, setReaders } from '@/lib/ai/knowledge/server'
import { extractLinks } from '@/lib/ai/processors/markdown-processor'
import { triggerSourceProcessing } from '@/lib/ai/knowledge/process-trigger'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — conhecimento da LOJA.
// GET: a árvore por pasta, cada nota com quem a lê.
// POST: nota nova { name, body_markdown, folder?, tags?, agent_ids? }.
export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const { data, error } = await supabase
    .from('ai_sources')
    .select(NOTE_COLUMNS)
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try {
    const readers = await readersBySource(supabase, organizationId)
    return NextResponse.json({ folders: buildTree((data ?? []) as any, readers), total: data?.length ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const markdown = typeof body?.body_markdown === 'string' ? body.body_markdown : ''
  if (!name) return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
  if (markdown.length > 100_000) return NextResponse.json({ error: 'nota excede 100 mil caracteres' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const agentIds = await ownAgentIds(supabase, organizationId, body?.agent_ids)
  if (agentIds === null) return NextResponse.json({ error: 'agent_ids com agente de outra organização' }, { status: 400 })

  const { data: note, error } = await supabase
    .from('ai_sources')
    .insert({
      organization_id: organizationId,
      source_type: 'text',
      kind: 'note',
      name,
      folder: typeof body?.folder === 'string' && body.folder.trim() ? body.folder.trim() : 'geral',
      tags: Array.isArray(body?.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [],
      body_markdown: markdown,
      text_content: markdown,
      links: extractLinks(markdown),
      status: markdown.trim() ? 'pending' : 'ready',
      chunks_count: 0,
      updated_by: auth.user.id,
    })
    .select(NOTE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await setReaders(supabase, organizationId, note.id, agentIds)
  } catch (e) {
    console.error('Error linking note readers:', e)
  }
  if (markdown.trim()) {
    triggerSourceProcessing(note.id, organizationId).catch((e) => console.error('Error processing note:', e))
  }
  return NextResponse.json({ note: { ...note, readers: agentIds } }, { status: 201 })
}
