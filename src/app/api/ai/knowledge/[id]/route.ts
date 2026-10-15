import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { backlinks, renameLinks } from '@/lib/ai/knowledge/notes'
import { NOTE_COLUMNS, readersBySource } from '@/lib/ai/knowledge/server'
import { extractLinks } from '@/lib/ai/processors/markdown-processor'
import { triggerSourceProcessing } from '@/lib/ai/knowledge/process-trigger'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — uma nota: ler (com leitores e backlinks), editar
// (renomear reescreve os [[links]] nas outras notas), excluir.

async function load(supabase: any, organizationId: string, id: string) {
  const { data } = await supabase
    .from('ai_sources')
    .select(`${NOTE_COLUMNS}, body_markdown, text_content`)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const note = await load(supabase, organizationId, params.id)
  if (!note) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })
  const [readers, others] = await Promise.all([
    readersBySource(supabase, organizationId, [note.id]),
    supabase.from('ai_sources').select('id, name, links').eq('organization_id', organizationId).neq('id', note.id),
  ])
  return NextResponse.json({
    note: { ...note, readers: readers.get(note.id) ?? [] },
    backlinks: backlinks(note.name, others.data ?? []),
  })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const note = await load(supabase, organizationId, params.id)
  if (!note) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })

  const editsContent = typeof body.body_markdown === 'string'
  if (note.read_only && editsContent) {
    return NextResponse.json({ error: 'Fonte sincronizada é somente leitura' }, { status: 409 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth.user.id }
  const newName = typeof body.name === 'string' ? body.name.trim() : null
  if (newName === '') return NextResponse.json({ error: 'name não pode ser vazio' }, { status: 400 })
  if (newName) update.name = newName
  if (typeof body.folder === 'string') update.folder = body.folder.trim() || 'geral'
  if (Array.isArray(body.tags)) update.tags = body.tags.filter((t: unknown) => typeof t === 'string')
  if (editsContent) {
    if (body.body_markdown.length > 100_000) {
      return NextResponse.json({ error: 'nota excede 100 mil caracteres' }, { status: 400 })
    }
    update.body_markdown = body.body_markdown
    update.text_content = body.body_markdown
    update.links = extractLinks(body.body_markdown)
    update.status = 'pending'
  }

  const { data: saved, error } = await supabase
    .from('ai_sources')
    .update(update)
    .eq('id', note.id)
    .eq('organization_id', organizationId)
    .select(NOTE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Renomear: as notas que apontavam para o título antigo passam a apontar
  // para o novo. O texto dos chunks dessas notas não é reprocessado (o link
  // vira só um rótulo no chunk; reprocessar custaria embeddings sem ganho).
  let relinked = 0
  if (newName && newName !== note.name) {
    const { data: pointing } = await supabase
      .from('ai_sources')
      .select('id, body_markdown, links')
      .eq('organization_id', organizationId)
      .contains('links', [note.name])
    for (const other of pointing ?? []) {
      const rewritten = renameLinks(other.body_markdown ?? '', note.name, newName)
      await supabase
        .from('ai_sources')
        .update({ body_markdown: rewritten, text_content: rewritten, links: extractLinks(rewritten) })
        .eq('id', other.id)
        .eq('organization_id', organizationId)
      relinked += 1
    }
  }

  if (editsContent && body.body_markdown.trim()) {
    triggerSourceProcessing(note.id, organizationId).catch((e) => console.error('Error reprocessing note:', e))
  }
  return NextResponse.json({ note: saved, relinked })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_sources')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
