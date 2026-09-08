// =============================================
// Targeting de popups — a parte que roda no servidor.
//
// O runtime decide sozinho o que dá para decidir no navegador (página,
// carrinho, origem do tráfego). O que depende de quem a pessoa É (estar num
// segmento ou numa lista) só o servidor sabe, e passa por aqui:
//
//   readAudienceTargeting  — lê behavior.audienceTargeting com validação
//                            (só UUIDs, modo conhecido).
//   contactIdForVisitor    — o mesmo visitante que a submissão grava,
//                            resolvido por visitor_identities e aliases.
//   isMemberOfAudience     — pertence a algum dos segmentos/listas?
//
// Tudo escopado pela organização do formulário: um id de segmento de outra
// org colado no JSON não conta, porque a consulta filtra organization_id.
// =============================================
import type { SupabaseClient } from '@supabase/supabase-js'

export type AudienceMode = 'off' | 'include' | 'exclude'

export interface AudienceTargeting {
  mode: AudienceMode
  segmentIds: string[]
  listIds: string[]
}

export const TRAFFIC_TYPES = [
  { key: 'direct', label: 'Direto', hint: 'Digitou a URL ou veio de favoritos.' },
  { key: 'organic', label: 'Busca orgânica', hint: 'Google, Bing e outros buscadores, sem anúncio.' },
  { key: 'paid', label: 'Anúncios pagos', hint: 'utm_medium cpc/paid ou parâmetros de clique (gclid, fbclid, ttclid).' },
  { key: 'social', label: 'Redes sociais', hint: 'Instagram, Facebook, TikTok, YouTube, Pinterest, X.' },
  { key: 'email', label: 'E-mail', hint: 'utm_medium=email ou origem de newsletter.' },
  { key: 'messaging', label: 'WhatsApp / SMS', hint: 'utm_medium whatsapp, sms ou utm_source correspondente.' },
  { key: 'referral', label: 'Outros sites', hint: 'Qualquer outra referência externa.' },
] as const

export type TrafficType = (typeof TRAFFIC_TYPES)[number]['key']

export const PAGE_TEMPLATES = [
  { key: 'index', label: 'Página inicial' },
  { key: 'product', label: 'Página de produto' },
  { key: 'collection', label: 'Coleção' },
  { key: 'list-collections', label: 'Lista de coleções' },
  { key: 'cart', label: 'Carrinho' },
  { key: 'search', label: 'Busca' },
  { key: 'blog', label: 'Blog' },
  { key: 'article', label: 'Artigo do blog' },
  { key: 'page', label: 'Página institucional' },
  { key: 'other', label: 'Outras páginas' },
] as const

const TRAFFIC_KEYS: ReadonlySet<string> = new Set(TRAFFIC_TYPES.map((t) => t.key))
const PAGE_KEYS: ReadonlySet<string> = new Set(PAGE_TEMPLATES.map((t) => t.key))

/** Só o vocabulário do runtime entra no banco; qualquer outra coisa vira nulo. */
export function trafficTypeOrNull(v: unknown): TrafficType | null {
  return typeof v === 'string' && TRAFFIC_KEYS.has(v) ? (v as TrafficType) : null
}
export function pageKindOrNull(v: unknown): string | null {
  return typeof v === 'string' && PAGE_KEYS.has(v) ? v : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuidList(v: unknown, cap = 50): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x === 'string' && UUID_RE.test(x) && !out.includes(x)) out.push(x)
    if (out.length >= cap) break
  }
  return out
}

export function readAudienceTargeting(behavior: any): AudienceTargeting {
  const raw = behavior?.audienceTargeting
  const mode: AudienceMode = raw?.mode === 'include' || raw?.mode === 'exclude' ? raw.mode : 'off'
  const segmentIds = uuidList(raw?.segmentIds)
  const listIds = uuidList(raw?.listIds)
  if (mode === 'off' || (!segmentIds.length && !listIds.length)) return { mode: 'off', segmentIds: [], listIds: [] }
  return { mode, segmentIds, listIds }
}

/** O gate de audiência precisa consultar o servidor? */
export function audienceGateEnabled(behavior: any): boolean {
  return readAudienceTargeting(behavior).mode !== 'off'
}

/**
 * Visitante → contato. Primeiro a identidade canônica, depois a tabela de
 * aliases (ids antigos do mesmo navegador). Nunca por e-mail: o id de
 * visitante é um token longo e aleatório, o e-mail é adivinhável.
 */
export async function contactIdForVisitor(admin: SupabaseClient, orgId: string, visitorId: string): Promise<string | null> {
  const vid = (visitorId || '').trim()
  if (!vid || vid.length > 128) return null

  const { data: identity } = await admin
    .from('visitor_identities')
    .select('contact_id')
    .eq('organization_id', orgId)
    .eq('worder_visitor_id', vid)
    .not('contact_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (identity?.contact_id) return identity.contact_id as string

  const { data: alias } = await admin
    .from('visitor_id_aliases')
    .select('identity_id')
    .eq('organization_id', orgId)
    .eq('alias_visitor_id', vid)
    .maybeSingle()
  if (!alias?.identity_id) return null

  const { data: aliased } = await admin
    .from('visitor_identities')
    .select('contact_id')
    .eq('id', alias.identity_id)
    .eq('organization_id', orgId)
    .not('contact_id', 'is', null)
    .maybeSingle()
  return (aliased?.contact_id as string) || null
}

export interface MembershipResult {
  member: boolean
  /** O que bateu, para o log de depuração do lojista. Nunca vai ao navegador. */
  via: 'list' | 'segment_static' | 'segment_dynamic' | null
}

/**
 * O contato está em alguma das listas ou segmentos? Listas leem a tabela
 * de membros; segmentos estáticos idem; segmentos dinâmicos usam o snapshot
 * que o cron de detecção refaz a cada rodada — o mesmo conjunto que dispara
 * as automações de "entrou no segmento", então a régua e o popup enxergam a
 * mesma pessoa. Segmentos e listas de outra org são ignorados na consulta.
 */
export async function isMemberOfAudience(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  targeting: AudienceTargeting,
): Promise<MembershipResult> {
  if (targeting.listIds.length) {
    const { data: lists } = await admin
      .from('contact_lists')
      .select('id')
      .eq('organization_id', orgId)
      .in('id', targeting.listIds)
    const ownedListIds = (lists || []).map((l: any) => l.id as string)
    if (ownedListIds.length) {
      const { data: m } = await admin
        .from('contact_list_members')
        .select('list_id')
        .eq('contact_id', contactId)
        .in('list_id', ownedListIds)
        .limit(1)
      if (m && m.length) return { member: true, via: 'list' }
    }
  }

  if (targeting.segmentIds.length) {
    const { data: segs } = await admin
      .from('customer_segments')
      .select('id, segment_type')
      .eq('organization_id', orgId)
      .in('id', targeting.segmentIds)
    const owned = segs || []
    const staticIds = owned.filter((s: any) => s.segment_type === 'static').map((s: any) => s.id as string)
    const dynamicIds = owned.filter((s: any) => s.segment_type !== 'static').map((s: any) => s.id as string)

    if (staticIds.length) {
      const { data: m } = await admin
        .from('segment_members')
        .select('segment_id')
        .eq('contact_id', contactId)
        .in('segment_id', staticIds)
        .limit(1)
      if (m && m.length) return { member: true, via: 'segment_static' }
    }
    if (dynamicIds.length) {
      const { data: m } = await admin
        .from('segment_memberships_snapshot')
        .select('segment_id')
        .eq('organization_id', orgId)
        .in('segment_id', dynamicIds)
        .contains('contact_ids', [contactId])
        .limit(1)
      if (m && m.length) return { member: true, via: 'segment_dynamic' }
    }
  }

  return { member: false, via: null }
}

/**
 * Decide o gate de audiência. `null` = não bloqueia; string = motivo.
 * Visitante desconhecido nunca está num segmento: em modo "somente quem
 * está" ele não vê; em modo "exceto quem está" ele vê.
 */
export async function audienceBlockReason(
  admin: SupabaseClient,
  orgId: string,
  contactId: string | null,
  targeting: AudienceTargeting,
): Promise<string | null> {
  if (targeting.mode === 'off') return null
  if (!contactId) return targeting.mode === 'include' ? 'not_in_audience' : null
  const { member } = await isMemberOfAudience(admin, orgId, contactId, targeting)
  if (targeting.mode === 'include') return member ? null : 'not_in_audience'
  return member ? 'in_excluded_audience' : null
}
