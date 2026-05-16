// =============================================
// WORDER: Segment resolver (advanced)
// /src/lib/segments/resolver.ts
//
// Suporta:
// - Grupos aninhados com AND/OR
// - Operadores: equals, not_equals, contains, not_contains, starts_with,
//   ends_with, greater_than, less_than, between, in, not_in,
//   is_null, is_not_null, gte, lte
// - Filtros comportamentais: has_event, no_event_since (via subquery)
// - Filtros RFM (referencia shopify_rfm_scores)
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'

type Operator =
  | 'equals' | '=' | 'not_equals' | '!='
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'greater_than' | '>' | 'gte' | '>='
  | 'less_than' | '<' | 'lte' | '<='
  | 'between'
  | 'in' | 'not_in'
  | 'is_null' | 'is_not_null'
  | 'has_event' | 'no_event_since'
  | 'has_tag' | 'not_has_tag'

interface Rule {
  field?: string
  operator?: Operator
  value?: any
  /** campos para has_event/no_event_since */
  event_type?: string
  within_days?: number
  /** grupo aninhado */
  rules?: Rule[]
  /** operador lógico do grupo (default AND) */
  logic?: 'and' | 'or'
}

interface Conditions {
  logic?: 'and' | 'or'
  rules?: Rule[]
  // Legacy shape: conditions pode ser o array diretamente
  [k: number]: Rule | undefined
  length?: number
}

/**
 * Retorna lista de contact_ids que satisfazem o segmento.
 *
 * Quando o segmento tem store_id, propaga pro resolveByConditions
 * pra que a query de contatos exclua qualquer linha de loja irmã
 * dentro da mesma org. Antes o resolver puxava org-wide e o segment
 * "VIP Dr. Melaxin" acabava incluindo contatos do Based.
 */
export async function resolveSegment(
  supabase: SupabaseClient,
  segmentId: string,
  orgId: string
): Promise<string[]> {
  try {
    // Tenta customer_segments primeiro (tabela principal), depois segments (legada/view)
    let segment: any = null
    let storeId: string | null = null
    const { data: cs } = await supabase
      .from('customer_segments')
      .select('rules, rules_logic, rfm_segments, segment_type, store_id')
      .eq('id', segmentId)
      .maybeSingle()
    if (cs) {
      segment = { conditions: { logic: (cs.rules_logic || 'AND').toLowerCase(), rules: cs.rules || [] } }
      storeId = cs.store_id || null
    } else {
      const { data: s } = await supabase
        .from('segments')
        .select('conditions, store_id')
        .eq('id', segmentId)
        .maybeSingle()
      segment = s
      storeId = s?.store_id || null
    }
    if (!segment) return []
    return resolveByConditions(supabase, segment.conditions, orgId, storeId)
  } catch (err) {
    console.error('[resolveSegment] error:', err)
    return []
  }
}

/**
 * Retorna contact_ids que satisfazem as conditions.
 * storeId opcional: quando passado, restringe a contatos daquela
 * loja (preserva contatos com store_id IS NULL — legacy que será
 * backfilled pelo próximo touch do customer-sync).
 */
export async function resolveByConditions(
  supabase: SupabaseClient,
  conditions: any,
  orgId: string,
  storeId?: string | null
): Promise<string[]> {
  // Normaliza legacy: se é array puro, envolve em { logic: 'and', rules: [...] }
  const root: Rule = Array.isArray(conditions)
    ? { logic: 'and', rules: conditions }
    : (conditions && typeof conditions === 'object'
        ? { logic: conditions.logic || 'and', rules: conditions.rules || [] }
        : { logic: 'and', rules: [] })

  // Busca superset de contatos da org (com escopo store quando aplicável)
  let q: any = supabase
    .from('contacts')
    .select('id, email, phone, first_name, last_name, tags, custom_fields, created_at, last_active_at, total_orders, total_revenue, last_order_date, status, lifecycle_stage, is_subscribed_email, shopify_customer_id, store_id')
    .eq('organization_id', orgId)
  if (storeId) {
    // Aceita contatos da mesma loja OR sem loja (legacy backfill pending)
    q = q.or(`store_id.eq.${storeId},store_id.is.null`)
  }
  const { data: allContacts } = await q

  if (!allContacts) return []

  // Pre-carrega mapas auxiliares se a condição usa event/rfm
  const usedEvents = collectEventRules(root)
  const eventOccurrencesByContact = usedEvents.length
    ? await loadEventOccurrences(supabase, orgId, usedEvents)
    : new Map<string, Map<string, string[]>>() // contactId → type → [occurred_at]

  const matched: string[] = []
  for (const c of allContacts) {
    if (evalRule(root, c, eventOccurrencesByContact.get(c.id) || new Map())) {
      matched.push(c.id)
    }
  }
  return matched
}

export async function countSegmentByConditions(
  supabase: SupabaseClient,
  conditions: any,
  orgId: string,
  storeId?: string | null
): Promise<number> {
  const ids = await resolveByConditions(supabase, conditions, orgId, storeId)
  return ids.length
}

// -------- helpers --------

function collectEventRules(rule: Rule): string[] {
  const out: string[] = []
  const walk = (r: Rule) => {
    if (r.rules) { r.rules.forEach(walk); return }
    if (r.operator === 'has_event' || r.operator === 'no_event_since') {
      if (r.event_type) out.push(r.event_type)
    }
  }
  walk(rule)
  return Array.from(new Set(out))
}

async function loadEventOccurrences(
  supabase: SupabaseClient,
  orgId: string,
  eventTypes: string[]
): Promise<Map<string, Map<string, string[]>>> {
  const map = new Map<string, Map<string, string[]>>()
  const { data } = await supabase
    .from('contact_events')
    .select('contact_id, event_type, occurred_at')
    .eq('organization_id', orgId)
    .in('event_type', eventTypes)
    .order('occurred_at', { ascending: false })
    .limit(50000)
  for (const row of data || []) {
    if (!row.contact_id) continue
    const byContact = map.get(row.contact_id) || new Map<string, string[]>()
    const arr = byContact.get(row.event_type) || []
    arr.push(row.occurred_at)
    byContact.set(row.event_type, arr)
    map.set(row.contact_id, byContact)
  }
  return map
}

function evalRule(
  rule: Rule,
  contact: any,
  eventsByType: Map<string, string[]>
): boolean {
  if (rule.rules) {
    const logic = rule.logic || 'and'
    const results = rule.rules.map((r) => evalRule(r, contact, eventsByType))
    return logic === 'or' ? results.some(Boolean) : results.every(Boolean)
  }
  return evalLeaf(rule, contact, eventsByType)
}

function evalLeaf(
  rule: Rule,
  contact: any,
  eventsByType: Map<string, string[]>
): boolean {
  const op = rule.operator
  if (!op) return true

  if (op === 'has_event') {
    const occs = eventsByType.get(rule.event_type || '') || []
    if (!rule.within_days) return occs.length > 0
    const threshold = Date.now() - rule.within_days * 24 * 60 * 60 * 1000
    return occs.some((ts) => new Date(ts).getTime() >= threshold)
  }

  if (op === 'no_event_since') {
    const occs = eventsByType.get(rule.event_type || '') || []
    if (!rule.within_days) return occs.length === 0
    const threshold = Date.now() - rule.within_days * 24 * 60 * 60 * 1000
    return !occs.some((ts) => new Date(ts).getTime() >= threshold)
  }

  if (op === 'has_tag') {
    const tags: string[] = Array.isArray(contact.tags) ? contact.tags : []
    return tags.includes(String(rule.value))
  }
  if (op === 'not_has_tag') {
    const tags: string[] = Array.isArray(contact.tags) ? contact.tags : []
    return !tags.includes(String(rule.value))
  }

  const raw = getFieldValue(contact, rule.field || '')
  const val = rule.value

  switch (op) {
    case 'equals':
    case '=':
      return String(raw) === String(val)
    case 'not_equals':
    case '!=':
      return String(raw) !== String(val)
    case 'contains':
      return String(raw ?? '').toLowerCase().includes(String(val ?? '').toLowerCase())
    case 'not_contains':
      return !String(raw ?? '').toLowerCase().includes(String(val ?? '').toLowerCase())
    case 'starts_with':
      return String(raw ?? '').toLowerCase().startsWith(String(val ?? '').toLowerCase())
    case 'ends_with':
      return String(raw ?? '').toLowerCase().endsWith(String(val ?? '').toLowerCase())
    case 'greater_than':
    case '>':
      return Number(raw) > Number(val)
    case 'gte':
    case '>=':
      return Number(raw) >= Number(val)
    case 'less_than':
    case '<':
      return Number(raw) < Number(val)
    case 'lte':
    case '<=':
      return Number(raw) <= Number(val)
    case 'between': {
      const parts = Array.isArray(val) ? val : String(val ?? '').split(',').map((s) => s.trim())
      const [a, b] = [Number(parts[0]), Number(parts[1])]
      return Number(raw) >= a && Number(raw) <= b
    }
    case 'in':
      return (Array.isArray(val) ? val : [val]).map(String).includes(String(raw))
    case 'not_in':
      return !(Array.isArray(val) ? val : [val]).map(String).includes(String(raw))
    case 'is_null':
      return raw === null || raw === undefined || raw === ''
    case 'is_not_null':
      return raw !== null && raw !== undefined && raw !== ''
    default:
      return false
  }
}

function getFieldValue(contact: any, field: string): any {
  if (!field) return undefined
  if (field.startsWith('custom.') || field.startsWith('custom_fields.')) {
    const key = field.replace(/^custom[._]/, '').replace(/^fields\./, '')
    return contact?.custom_fields?.[key]
  }
  // Dot notation
  if (field.includes('.')) {
    const parts = field.split('.')
    let cur: any = contact
    for (const p of parts) {
      if (cur == null) return undefined
      cur = cur[p]
    }
    return cur
  }
  return contact?.[field]
}
