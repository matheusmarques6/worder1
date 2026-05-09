// =============================================
// WORDER: Trigger dispatcher
// /src/lib/automation/trigger-dispatcher.ts
//
// Helper unificado para disparar automations_runs a partir de um evento.
// Usado por form submit, segment entry, inactivity cron, back-in-stock,
// click-to-WA ad, viewed_product, etc.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface DispatchOptions {
  organizationId: string
  triggerType: string // ex: 'trigger_form_submitted', 'trigger_segment', etc
  /** dados expostos em {{trigger.*}} nos templates */
  triggerData?: Record<string, any>
  /** contato associado (preferido) */
  contactId?: string | null
  /** deal associado */
  dealId?: string | null
  /** filtra automações por config matching (ex: form_id, segment_id) */
  matchConfig?: (cfg: Record<string, any>) => boolean
  /** idempotency: não cria run se já existe um com essa key nas últimas 24h */
  idempotencyKey?: string
  /** delay em minutos antes da execução */
  delayMinutes?: number
}

export interface DispatchResult {
  automationsMatched: number
  runsCreated: number
  runIds: string[]
}

/**
 * Busca automações ativas com o trigger_type informado e cria automation_runs
 * pendentes para cada uma.
 */
export async function dispatchTrigger(opts: DispatchOptions): Promise<DispatchResult> {
  const {
    organizationId,
    triggerType,
    triggerData = {},
    dealId,
    matchConfig,
    idempotencyKey,
    delayMinutes,
  } = opts
  let { contactId } = opts

  // 1a. Late contact resolution — when the upstream caller couldn't sync
  // the contact in time (race with the contacts upsert from another
  // webhook), look the contact up by email here so the run isn't
  // created orphan. Without this every run shows "Sem contato" and
  // the email node has no merge data.
  if (!contactId) {
    const td: any = triggerData || {}
    const props: any = td.properties || td
    const candidateEmail =
      td.CustomerEmail || td.email || td.Email ||
      props.CustomerEmail || props.email || props.Email ||
      props?.Customer?.Email || props?.raw?.email ||
      props?.raw?.customer?.email || props?.raw?.billing_address?.email
    if (candidateEmail && typeof candidateEmail === 'string') {
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', candidateEmail)
        .maybeSingle()
      if (existing?.id) {
        contactId = existing.id
      } else {
        const { data: created } = await supabaseAdmin
          .from('contacts')
          .insert({
            organization_id: organizationId,
            email: candidateEmail,
            source: `trigger:${triggerType}`,
          })
          .select('id')
          .single()
        if (created?.id) contactId = created.id
      }
    }
  }

  // 0b. Welcome trigger: by default Omnisend only fires on the contact's
  // first marketing subscription (so existing customers don't suddenly
  // get a welcome series when their consent is re-confirmed). We honor
  // that unless the merchant explicitly opts into "every signup" via
  // trigger_config.fireOnEverySignup.
  if (triggerType === 'trigger_signup' && contactId) {
    const { data: prev } = await supabaseAdmin
      .from('automation_runs')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      // Any prior signup-triggered run for this contact disqualifies new ones.
      .eq('trigger_type', 'trigger_signup')
      .limit(1)
      .maybeSingle()
    if (prev) {
      // Will be filtered later only against automations that DON'T have
      // fireOnEverySignup. Fast-path: if zero automations care, skip.
      const { data: opted } = await supabaseAdmin
        .from('automations')
        .select('id, trigger_config')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .eq('trigger_type', 'trigger_signup')
      const anyOptIn = (opted || []).some((a: any) => a?.trigger_config?.fireOnEverySignup)
      if (!anyOptIn) {
        return { automationsMatched: 0, runsCreated: 0, runIds: [] }
      }
    }
  }

  // 1. Idempotência: se já existe run idempotente nas últimas 24h, pula
  if (idempotencyKey) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existing } = await supabaseAdmin
      .from('automation_runs')
      .select('id')
      .eq('organization_id', organizationId)
      .gte('created_at', since)
      .contains('metadata', { idempotency_key: idempotencyKey })
      .limit(1)
      .maybeSingle()
    if (existing) {
      return { automationsMatched: 0, runsCreated: 0, runIds: [] }
    }
  }

  // 2. Buscar automações com esse trigger
  const { data: automations, error } = await supabaseAdmin
    .from('automations')
    .select('id, trigger_config, audience_filters, trigger_filters, frequency_config')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('trigger_type', triggerType)

  if (error) {
    console.error('[dispatchTrigger] fetch automations error:', error)
    return { automationsMatched: 0, runsCreated: 0, runIds: [] }
  }

  if (!automations || automations.length === 0) {
    return { automationsMatched: 0, runsCreated: 0, runIds: [] }
  }

  // 3. Aplicar matchConfig se fornecido (ex: filtra por form_id, segment_id)
  let eligible: any[] = matchConfig
    ? automations.filter((a: any) => matchConfig(a.trigger_config || {}))
    : automations

  // 3b. Apply audience_filters (per-contact filters configured in the
  // trigger node UI). The schema allows up to 5 rows of {field, operator,
  // value} that filter on contact properties — until now this column
  // was loaded but never evaluated, so the filters were silently
  // ignored. Load the contact once and run the filters; drop any
  // automation whose filters don't all match (AND logic).
  if (contactId) {
    const automationsWithFilters = eligible.filter(
      (a: any) => Array.isArray(a.audience_filters) && a.audience_filters.length > 0
    )
    if (automationsWithFilters.length > 0) {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('email, first_name, last_name, phone, city, state, country, tags, lifecycle_stage, total_orders, total_spent, aov, last_order_at, created_at')
        .eq('id', contactId)
        .maybeSingle()

      const matchesFilter = (row: any): boolean => {
        if (!contact || !row?.field) return true
        const raw = (contact as any)[row.field]
        const op = row.operator || 'equals'
        const val = row.value

        // is_set / is_not_set don't need a value
        const isPresent = raw !== null && raw !== undefined && raw !== ''
        if (op === 'is_set') return isPresent
        if (op === 'is_not_set') return !isPresent

        if (val === undefined || val === '') return true // empty filter, ignore

        // tags is an array — operate against it
        if (row.field === 'tags' && Array.isArray(raw)) {
          const needle = String(val).trim().toLowerCase()
          const tags = raw.map((t: any) => String(t).trim().toLowerCase())
          if (op === 'contains' || op === 'equals') return tags.includes(needle)
          if (op === 'not_contains' || op === 'not_equals') return !tags.includes(needle)
          if (op === 'in_list') {
            const list = String(val).split(',').map((s: string) => s.trim().toLowerCase())
            return tags.some((t: string) => list.includes(t))
          }
          return true
        }

        const isNumericField = ['total_orders', 'total_spent', 'aov'].includes(row.field)
        const isDateField = ['last_order_at', 'created_at'].includes(row.field)

        if (isNumericField) {
          const a = parseFloat(raw)
          const b = parseFloat(String(val))
          if (Number.isNaN(a) || Number.isNaN(b)) return false
          if (op === 'equals') return a === b
          if (op === 'not_equals') return a !== b
          if (op === 'greater_than') return a > b
          if (op === 'less_than') return a < b
          if (op === 'greater_or_equal') return a >= b
          if (op === 'less_or_equal') return a <= b
          return true
        }

        if (isDateField && op === 'in_last_x_days') {
          const days = parseInt(String(val), 10)
          if (!days || !raw) return false
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
          return new Date(raw) >= cutoff
        }

        const a = String(raw ?? '').toLowerCase()
        const b = String(val).toLowerCase()
        switch (op) {
          case 'equals': return a === b
          case 'not_equals': return a !== b
          case 'contains': return a.includes(b)
          case 'not_contains': return !a.includes(b)
          case 'starts_with': return a.startsWith(b)
          case 'ends_with': return a.endsWith(b)
          case 'in_list': return String(val).split(',').map(s => s.trim().toLowerCase()).includes(a)
          default: return true
        }
      }

      eligible = eligible.filter((a: any) => {
        const filters = a.audience_filters
        if (!Array.isArray(filters) || filters.length === 0) return true
        // AND across all filter rows
        return filters.every(matchesFilter)
      })
    }
  } else {
    // No contact resolved — drop any automation that requires audience
    // filtering, since there's no contact to evaluate against.
    eligible = eligible.filter(
      (a: any) => !Array.isArray(a.audience_filters) || a.audience_filters.length === 0
    )
  }

  // 3c. Apply trigger_filters (per-event-payload filters configured in
  // the trigger node UI). Same {field, operator, value} shape as
  // audience_filters but evaluated against the trigger payload instead
  // of the contact. Crucial for "only fire viewed_product when SKU =
  // X" / "only fire placed_order when value > 100".
  const evalAgainstPayload = (filters: any[], payload: any): boolean => {
    if (!Array.isArray(filters) || filters.length === 0) return true
    const props = payload?.properties || payload || {}
    const items: any[] = Array.isArray(props.Items) ? props.Items : []
    const pickValue = (field: string): any => {
      // Item-level lookups: any item satisfying the predicate is enough
      if (['sku', 'product_id', 'product_name', 'variant_id', 'brand'].includes(field)) {
        return items.length > 0 ? items.map((it: any) => {
          if (field === 'sku') return it.SKU || it.sku
          if (field === 'product_id') return it.ProductID || it.product_id
          if (field === 'product_name') return it.ProductName || it.title
          if (field === 'variant_id') return it.VariantID || it.variant_id
          if (field === 'brand') return it.Brand || it.brand
          return undefined
        }) : []
      }
      // Cart/order level
      if (field === 'cart_value' || field === 'order_value' || field === 'value') {
        return parseFloat(props.$value || props.Value || props.cart_value || props.value || 0)
      }
      if (field === 'item_count') return items.length || parseInt(props.ItemCount || 0, 10)
      if (field === 'currency') return props.Currency || props.currency
      // generic
      return props[field]
    }

    const numericFields = new Set(['cart_value', 'order_value', 'value', 'item_count'])

    return filters.every((row: any) => {
      const op = row.operator || 'equals'
      const val = row.value
      const raw = pickValue(row.field)
      const isArray = Array.isArray(raw)
      const isPresent = isArray ? raw.some((x: any) => x !== null && x !== undefined && x !== '') :
        (raw !== null && raw !== undefined && raw !== '')
      if (op === 'is_set') return isPresent
      if (op === 'is_not_set') return !isPresent
      if (val === undefined || val === '') return true

      if (numericFields.has(row.field)) {
        const a = parseFloat(String(raw))
        const b = parseFloat(String(val))
        if (Number.isNaN(a) || Number.isNaN(b)) return false
        switch (op) {
          case 'equals': return a === b
          case 'not_equals': return a !== b
          case 'greater_than': return a > b
          case 'less_than': return a < b
          case 'greater_or_equal': return a >= b
          case 'less_or_equal': return a <= b
        }
        return true
      }

      const haystack = isArray
        ? raw.map((x: any) => String(x ?? '').toLowerCase())
        : [String(raw ?? '').toLowerCase()]
      const needle = String(val).toLowerCase()
      const list = String(val).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      switch (op) {
        case 'equals': return haystack.some(h => h === needle)
        case 'not_equals': return haystack.every(h => h !== needle)
        case 'contains': return haystack.some(h => h.includes(needle))
        case 'not_contains': return haystack.every(h => !h.includes(needle))
        case 'starts_with': return haystack.some(h => h.startsWith(needle))
        case 'ends_with': return haystack.some(h => h.endsWith(needle))
        case 'in_list': return haystack.some(h => list.includes(h))
        case 'not_in_list': return haystack.every(h => !list.includes(h))
        default: return true
      }
    })
  }

  eligible = eligible.filter((a: any) =>
    evalAgainstPayload(a.trigger_filters || [], triggerData)
  )

  // 3d. Skip Contacts overlap protection (Omnisend-style). When the
  // same contact already has an active run (waiting / pending /
  // running) in another automation in this org and the merchant opted
  // into the org-level skip_contacts_in_active_flows flag, drop new
  // dispatches so we don't pile messages on top of each other.
  if (contactId) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('skip_contacts_in_active_flows')
      .eq('id', organizationId)
      .maybeSingle()
    if (org?.skip_contacts_in_active_flows) {
      const { data: active } = await supabaseAdmin
        .from('automation_runs')
        .select('id, automation_id')
        .eq('organization_id', organizationId)
        .eq('contact_id', contactId)
        .in('status', ['waiting', 'pending', 'running'])
        .limit(1)
        .maybeSingle()
      if (active) {
        return { automationsMatched: 0, runsCreated: 0, runIds: [] }
      }
    }
  }

  // 3e. Frequency config — re-entry guard. The merchant can configure
  // each automation as "once" (one run per contact ever), "interval"
  // (one run per X hours/days), or "unlimited". Without this the same
  // contact can pile into the same flow 10x in an hour from repeated
  // page views / cart adds.
  if (contactId) {
    const eligibleAfterFreq: any[] = []
    for (const auto of eligible) {
      const fc = auto.frequency_config || {}
      // Omnisend defaults: cart-recovery + browsing flows have a 1-day
      // re-entry cooldown by default — same contact can't pile into the
      // same flow multiple times in a day from repeated checkout/view
      // events. Lifecycle/order triggers default to "unlimited" so a
      // merchant can keep getting Order Confirmation emails per order.
      const recoveryTriggers = new Set([
        'trigger_checkout_abandoned',
        'trigger_abandon',
        'trigger_added_to_cart',
        'trigger_browse_abandoned',
      ])
      const omnisendDefault = recoveryTriggers.has(triggerType)
        ? { type: 'interval', value: 1, unit: 'days' }
        : { type: 'unlimited' as const }
      const ftype = fc.type || omnisendDefault.type
      if (ftype === 'unlimited') { eligibleAfterFreq.push(auto); continue }

      let since: string | null = null
      if (ftype === 'once') {
        since = '1970-01-01T00:00:00.000Z'
      } else if (ftype === 'interval') {
        const mult: Record<string, number> = {
          minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000,
        }
        const value = fc.value ?? (omnisendDefault as any).value
        const unit = fc.unit ?? (omnisendDefault as any).unit
        const ms = (parseInt(String(value || 0), 10) || 0) * (mult[unit || ''] || 0)
        if (ms > 0) since = new Date(Date.now() - ms).toISOString()
      }
      if (!since) { eligibleAfterFreq.push(auto); continue }

      const { data: prev } = await supabaseAdmin
        .from('automation_runs')
        .select('id')
        .eq('automation_id', auto.id)
        .eq('contact_id', contactId)
        .gte('created_at', since)
        .limit(1)
        .maybeSingle()
      if (!prev) eligibleAfterFreq.push(auto)
    }
    eligible = eligibleAfterFreq
  }

  const runIds: string[] = []
  const scheduledFor = delayMinutes
    ? new Date(Date.now() + delayMinutes * 60_000).toISOString()
    : null

  // 4. Criar run pra cada automação elegível
  //
  // Resilient insert: retries without optional columns when the schema
  // doesn't carry them (PGRST204 / 42703). Catches the merchant-blocking
  // case where automation_runs is missing deal_id, waiting_until, or
  // current_node_id columns — without this, the insert fails and NO
  // run is ever created, so the merchant sees nothing in history.
  function isMissingColumnErr(err: any, col: string): boolean {
    if (!err) return false
    const code = err.code || ''
    const msg = String(err.message || '')
    if (code === 'PGRST204' || code === '42703') return msg.includes(col)
    return msg.includes(col) && (msg.includes('column') || msg.includes('schema cache'))
  }

  for (const auto of eligible) {
    const metadata: Record<string, any> = {
      trigger_data: triggerData,
      trigger_type: triggerType,
    }
    if (idempotencyKey) metadata.idempotency_key = idempotencyKey

    const fullInsert: Record<string, any> = {
      organization_id: organizationId,
      automation_id: auto.id,
      contact_id: contactId || null,
      deal_id: dealId || null,
      status: scheduledFor ? 'waiting' : 'pending',
      // Persist as top-level column so the History panel doesn't fall
      // back to "Manual". Still mirrored in metadata for schemas where
      // this column hasn't been added yet (handled by the fallback chain).
      trigger_type: triggerType,
      metadata,
    }
    if (scheduledFor) {
      fullInsert.waiting_until = scheduledFor
    }

    // Optional fields that may not exist on older schemas. Drop one by
    // one on column-not-found errors until the insert succeeds. We
    // include every non-essential column the various migrations have
    // added — old DBs may be missing several at once.
    const fallbackChain = [
      'deal_id',
      'waiting_until',
      'trigger_event_id',
      'current_node_id',
      'trigger_type',
      'organization_id',  // last resort — without it tenancy is broken,
                           // but at least the run is created and the
                           // merchant sees what's happening
    ]
    let attempt: Record<string, any> = { ...fullInsert }
    let runId: string | null = null
    let lastErr: any = null
    for (let i = 0; i <= fallbackChain.length; i++) {
      const { data, error } = await supabaseAdmin
        .from('automation_runs')
        .insert(attempt)
        .select('id')
        .single()
      if (!error && data?.id) { runId = data.id; lastErr = null; break }
      lastErr = error
      const next = fallbackChain.find(c => isMissingColumnErr(error, c) && c in attempt)
      if (!next) break
      const { [next]: _drop, ...rest } = attempt
      attempt = rest
      console.warn(`[dispatchTrigger] retrying without ${next} (schema cache miss)`)
    }

    if (lastErr) {
      console.error('[dispatchTrigger] insert run error:', lastErr)
      console.error('[dispatchTrigger] HINT: run the migration at supabase/migrations/20260508_automation_runs_full_columns.sql to add missing columns')
      continue
    }
    if (runId) runIds.push(runId)
  }

  return {
    automationsMatched: eligible.length,
    runsCreated: runIds.length,
    runIds,
  }
}
