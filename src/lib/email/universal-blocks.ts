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
  delete copy._savedSectionId
  delete copy._savedSectionName
  delete copy._savedBlockId
  delete copy._savedBlockName
  for (const col of copy.columns || []) {
    for (const b of col.blocks || []) {
      delete b._savedBlockId
      delete b._savedBlockName
    }
  }
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
      .select('saved_block_id')
      .eq('organization_id', orgId)
    for (const row of data || []) {
      const id = (row as any).saved_block_id
      if (id) out[id] = (out[id] || 0) + 1
    }
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

// ── Apagar sem quebrar e-mail ───────────────────────────────────────

/**
 * Antes de apagar um universal, o conteúdo dele é escrito por extenso
 * em cada e-mail que o usava, e o vínculo cai. É o que a Omnisend faz:
 * os e-mails continuam iguais ao que a pessoa via, só param de receber
 * as próximas alterações. A alternativa — apagar e deixar o vínculo
 * pendurado — troca o rodapé de vinte e-mails por um buraco.
 *
 * Devolve quantos e-mails foram reescritos.
 */
export async function inlineIntoTemplates(orgId: string, savedId: string, row: SavedBlockRow): Promise<number> {
  const kind = savedKind(row)
  const content = stripLinks(savedContent(row))
  if (!content) return 0

  const { data: usage } = await supabaseAdmin
    .from('email_universal_usage')
    .select('template_id')
    .eq('organization_id', orgId)
    .eq('saved_block_id', savedId)
  const ids = Array.from(new Set((usage || []).map((r: any) => r.template_id).filter(Boolean)))
  if (ids.length === 0) return 0

  const { data: templates } = await supabaseAdmin
    .from('email_templates')
    .select('id, design_json')
    .eq('organization_id', orgId)
    .in('id', ids)

  let written = 0
  for (const t of templates || []) {
    const design = t.design_json as any
    if (!design?.sections) continue
    let touched = false

    design.sections = design.sections.map((sec: any) => {
      if (kind === 'section' && sec?._savedSectionId === savedId) {
        touched = true
        // Mantém o id da seção neste e-mail: o resto do documento (e o
        // que o usuário tem selecionado) referencia esse id.
        return { ...JSON.parse(JSON.stringify(content)), id: sec.id }
      }
      if (kind === 'block') {
        const columns = (sec.columns || []).map((col: any) => ({
          ...col,
          blocks: (col.blocks || []).map((b: any) => {
            if (b?._savedBlockId !== savedId) return b
            touched = true
            return { ...JSON.parse(JSON.stringify(content)), id: b.id }
          }),
        }))
        return { ...sec, columns }
      }
      return sec
    })

    if (!touched) continue
    const { error } = await supabaseAdmin
      .from('email_templates')
      .update({ design_json: design })
      .eq('id', t.id)
      .eq('organization_id', orgId)
    if (!error) written++
  }
  return written
}
