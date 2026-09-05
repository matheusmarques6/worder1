// ═══════════════════════════════════════════════════════════════════
// Conteúdo universal (saved_blocks): onde é usado e o que acontece
// quando some.
//
// Um universal é uma seção (ou bloco) guardada uma vez e apontada por
// vários e-mails. Editar um deles altera todos — por isso toda tela
// que mexe nisso precisa responder antes "isto chega em quantos
// e-mails, e quais?". Este módulo é quem responde.
//
// Fora de qualquer route.ts de propósito: um route file do App Router
// só pode exportar handlers e config.
// ═══════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase-admin'

export type UniversalKind = 'section' | 'block'

export interface SavedBlockRow {
  id: string
  name: string
  category: string | null
  block_json: any
  created_at?: string
  updated_at?: string
}

/** Seção ou bloco? A seção vem embrulhada em `{_kind:'section', section}`. */
export function savedKind(row: { block_json?: any; category?: string | null }): UniversalKind {
  if (row?.block_json?._kind === 'section') return 'section'
  if (row?.category === 'section') return 'section'
  return 'block'
}

/** O conteúdo de verdade, sem o envelope de armazenamento. */
export function savedContent(row: { block_json?: any; category?: string | null }): any {
  return savedKind(row) === 'section'
    ? (row?.block_json?.section ?? row?.block_json)
    : row?.block_json
}

/** Embrulha de volta para gravar em saved_blocks.block_json. */
export function wrapContent(kind: UniversalKind, content: any): any {
  return kind === 'section' ? { _kind: 'section', section: content } : content
}

/**
 * Tira os campos de vínculo de uma cópia do conteúdo. O que fica
 * guardado na biblioteca é o conteúdo puro: se o vínculo entrasse
 * junto, um universal passaria a apontar para si mesmo.
 */
export function stripLinks<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value))
  // O envelope da seção também passa por aqui: sem descer nele, o
  // vínculo ficava intacto lá dentro e a limpeza do servidor era só
  // aparente — funcionava porque a tela já limpava antes de enviar.
  const clean = (node: any) => {
    if (!node || typeof node !== 'object') return
    delete node._savedSectionId
    delete node._savedSectionName
    delete node._savedBlockId
    delete node._savedBlockName
    for (const col of node.columns || []) {
      for (const b of col.blocks || []) {
        delete b._savedBlockId
        delete b._savedBlockName
      }
    }
  }
  clean(copy)
  if (copy?._kind === 'section') clean(copy.section)
  return copy
}

// ── Onde é usado ────────────────────────────────────────────────────

export interface UsageEmail {
  templateId: string
  templateName: string
  /** Campanha ou automação que envia este e-mail; null = template solto. */
  origin: { type: 'campaign' | 'automation'; id: string; name: string; status?: string | null } | null
}

export interface Usage {
  /** Quantos e-mails contêm o universal. */
  count: number
  emails: UsageEmail[]
  campaigns: number
  automations: number
  /** E-mails que não estão em campanha nem automação. */
  loose: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Contagem de e-mails por universal, para a biblioteca inteira numa
 * consulta só — a lista mostra o selo "em N e-mails" em cada item e
 * uma consulta por item seria uma tempestade de requisições.
 */
export async function usageCounts(orgId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  try {
    const { data } = await supabaseAdmin
      .from('email_universal_usage')
      .select('saved_block_id, template_id')
      .eq('organization_id', orgId)
    // Conta E-MAIL, não vínculo: um e-mail com o mesmo rodapé no topo e
    // no rodapé é um e-mail. O selo diz "N e-mails" e tem de bater com
    // o número que o painel e a confirmação mostram.
    const seen = new Map<string, Set<string>>()
    for (const row of data || []) {
      const id = (row as any).saved_block_id
      const tpl = (row as any).template_id
      if (!id || !tpl) continue
      if (!seen.has(id)) seen.set(id, new Set())
      seen.get(id)!.add(tpl)
    }
    for (const [id, templates] of seen) out[id] = templates.size
  } catch {
    // Visão nova pode não existir num banco antigo: a tela some com o
    // selo de uso em vez de quebrar.
  }
  return out
}

/** Os e-mails que usam este universal, com a campanha/automação de cada um. */
export async function loadUsage(orgId: string, savedId: string): Promise<Usage> {
  const empty: Usage = { count: 0, emails: [], campaigns: 0, automations: 0, loose: 0 }
  if (!orgId || !UUID_RE.test(savedId)) return empty

  let rows: any[] = []
  try {
    const { data } = await supabaseAdmin
      .from('email_universal_usage')
      .select('template_id, template_name')
      .eq('organization_id', orgId)
      .eq('saved_block_id', savedId)
    rows = data || []
  } catch {
    return empty
  }

  // Um e-mail pode conter o mesmo universal duas vezes (dois rodapés,
  // por exemplo). Para "quantos e-mails" o que conta é o e-mail.
  const byTemplate = new Map<string, string>()
  for (const r of rows) {
    if (r.template_id) byTemplate.set(r.template_id, r.template_name || 'E-mail sem nome')
  }
  const templateIds = Array.from(byTemplate.keys())
  if (templateIds.length === 0) return empty

  const origins = new Map<string, UsageEmail['origin']>()

  // Campanhas apontam o template direto.
  try {
    const { data: campaigns } = await supabaseAdmin
      .from('email_campaigns')
      .select('id, name, status, template_id')
      .eq('organization_id', orgId)
      .in('template_id', templateIds)
    for (const c of campaigns || []) {
      if (c.template_id && !origins.has(c.template_id)) {
        origins.set(c.template_id, { type: 'campaign', id: c.id, name: c.name || 'Campanha sem nome', status: c.status })
      }
    }
  } catch { /* segue sem a origem */ }

  // Automações guardam o template dentro do nó de e-mail.
  try {
    const { data: automations } = await supabaseAdmin
      .from('automations')
      .select('id, name, status, nodes')
      .eq('organization_id', orgId)
    const wanted = new Set(templateIds)
    for (const a of automations || []) {
      for (const node of (a.nodes as any[]) || []) {
        const tid = node?.data?.config?.templateId
        if (tid && wanted.has(tid) && !origins.has(tid)) {
          origins.set(tid, { type: 'automation', id: a.id, name: a.name || 'Automação sem nome', status: a.status })
        }
      }
    }
  } catch { /* segue sem a origem */ }

  const emails: UsageEmail[] = templateIds.map((id) => ({
    templateId: id,
    templateName: byTemplate.get(id) || 'E-mail sem nome',
    origin: origins.get(id) || null,
  }))
  // Campanha primeiro, depois automação, depois solto — quem está no ar
  // é o que a pessoa precisa ver primeiro.
  const rank = (e: UsageEmail) => (e.origin?.type === 'campaign' ? 0 : e.origin?.type === 'automation' ? 1 : 2)
  emails.sort((a, b) => rank(a) - rank(b) || a.templateName.localeCompare(b.templateName, 'pt-BR'))

  return {
    count: emails.length,
    emails,
    campaigns: emails.filter((e) => e.origin?.type === 'campaign').length,
    automations: emails.filter((e) => e.origin?.type === 'automation').length,
    loose: emails.filter((e) => !e.origin).length,
  }
}

// ── Escrever nos e-mails que usam ───────────────────────────────────

/**
 * O e-mail guarda uma CÓPIA do universal, não uma referência: o envio
 * lê `email_templates.html`, já renderizado. Isso é o que torna o envio
 * barato — e é também onde a promessa "editar muda todos" se cumpre ou
 * se perde. Se o universal muda e a cópia não, o rodapé velho continua
 * saindo: as automações nem olham o design_json, vão direto no html.
 *
 * Então toda alteração num universal é escrita aqui, e-mail por e-mail,
 * design e html. É o preço de um envio que não precisa consultar a
 * biblioteca a cada destinatário.
 *
 * `keepLink` distingue os dois usos:
 *   true  — salvar: o e-mail recebe o conteúdo novo e continua ligado.
 *   false — apagar: recebe o conteúdo atual e o vínculo cai, para o
 *           e-mail seguir funcionando sozinho.
 */
async function rewriteTemplates(
  orgId: string,
  savedId: string,
  row: SavedBlockRow,
  opts: { keepLink: boolean; name?: string }
): Promise<number> {
  const kind = savedKind(row)
  const content = stripLinks(savedContent(row))
  if (!content) return 0

  let ids: string[] = []
  try {
    const { data: usage } = await supabaseAdmin
      .from('email_universal_usage')
      .select('template_id')
      .eq('organization_id', orgId)
      .eq('saved_block_id', savedId)
    ids = Array.from(new Set((usage || []).map((r: any) => r.template_id).filter(Boolean)))
  } catch {
    return 0
  }
  if (ids.length === 0) return 0

  const { data: templates } = await supabaseAdmin
    .from('email_templates')
    .select('id, design_json')
    .eq('organization_id', orgId)
    .in('id', ids)

  // O renderizador é uma função pura sobre o documento; importado aqui
  // para o módulo continuar utilizável de contextos que só querem ler.
  const { renderDocumentToHtml } = await import('@/lib/email/render-html')

  const link = (target: any) => {
    if (!opts.keepLink) return {}
    return kind === 'section'
      ? { _savedSectionId: savedId, _savedSectionName: opts.name ?? target._savedSectionName ?? row.name }
      : { _savedBlockId: savedId, _savedBlockName: opts.name ?? target._savedBlockName ?? row.name }
  }

  let written = 0
  for (const t of templates || []) {
    const design = t.design_json as any
    if (!design?.sections) continue
    let touched = false

    design.sections = design.sections.map((sec: any) => {
      if (kind === 'section' && sec?._savedSectionId === savedId) {
        touched = true
        // O id da seção neste e-mail é preservado: o resto do documento
        // (e a seleção aberta no editor) referencia esse id.
        return { ...JSON.parse(JSON.stringify(content)), id: sec.id, ...link(sec) }
      }
      if (kind === 'block') {
        const columns = (sec.columns || []).map((col: any) => ({
          ...col,
          blocks: (col.blocks || []).map((b: any) => {
            if (b?._savedBlockId !== savedId) return b
            touched = true
            return { ...JSON.parse(JSON.stringify(content)), id: b.id, ...link(b) }
          }),
        }))
        return { ...sec, columns }
      }
      return sec
    })

    if (!touched) continue

    // O html renderizado tem de acompanhar: é dele que a automação
    // envia. Se o render falhar, o design ainda é salvo — melhor um
    // html velho do que perder a alteração inteira.
    const patch: Record<string, any> = { design_json: design }
    try {
      patch.html = renderDocumentToHtml(design)
    } catch (err) {
      console.warn(`[universal] render falhou para o template ${t.id}`, err)
    }

    const { error } = await supabaseAdmin
      .from('email_templates')
      .update(patch)
      .eq('id', t.id)
      .eq('organization_id', orgId)
    if (!error) written++
  }
  return written
}

/**
 * Salvou o universal: leva o conteúdo novo para cada e-mail que o usa,
 * mantendo o vínculo. É isto que faz "editar em todos os e-mails" ser
 * verdade no que sai para o cliente, e não só na tela do editor.
 */
export function propagateToTemplates(orgId: string, savedId: string, row: SavedBlockRow, name?: string): Promise<number> {
  return rewriteTemplates(orgId, savedId, row, { keepLink: true, name })
}

/**
 * Antes de apagar um universal, o conteúdo dele é escrito por extenso
 * em cada e-mail que o usava, e o vínculo cai. É o que a Omnisend faz:
 * os e-mails continuam iguais ao que a pessoa via, só param de receber
 * as próximas alterações. A alternativa — apagar e deixar o vínculo
 * pendurado — troca o rodapé de vinte e-mails por um buraco.
 */
export function inlineIntoTemplates(orgId: string, savedId: string, row: SavedBlockRow): Promise<number> {
  return rewriteTemplates(orgId, savedId, row, { keepLink: false })
}

// ── Histórico ───────────────────────────────────────────────────────

/**
 * Guarda o conteúdo ANTERIOR antes de sobrescrever. Um universal em
 * vinte e três e-mails não tem desfazer natural: quando a alteração
 * está errada, ela já saiu em todos. O histórico é o caminho de volta.
 *
 * Nunca impede o salvamento: se a versão não puder ser gravada, a
 * alteração segue e só se perde o desfazer.
 */
export async function snapshotVersion(orgId: string, savedId: string, previous: any, userId?: string | null): Promise<void> {
  if (!previous) return
  try {
    const { data: last } = await supabaseAdmin
      .from('saved_block_versions')
      .select('version')
      .eq('block_id', savedId)
      .eq('organization_id', orgId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = ((last?.version as number) || 0) + 1
    await supabaseAdmin.from('saved_block_versions').insert({
      block_id: savedId,
      organization_id: orgId,
      version: nextVersion,
      block_json: previous,
      created_by: userId || null,
    })

    // Vinte versões bastam para voltar atrás; o resto é peso morto num
    // conteúdo que se edita com frequência.
    if (nextVersion > 20) {
      await supabaseAdmin
        .from('saved_block_versions')
        .delete()
        .eq('block_id', savedId)
        .eq('organization_id', orgId)
        .lte('version', nextVersion - 20)
    }
  } catch (err) {
    console.warn('[universal] não foi possível guardar a versão anterior', err)
  }
}
