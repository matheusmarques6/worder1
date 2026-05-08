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
    contactId,
    dealId,
    matchConfig,
    idempotencyKey,
    delayMinutes,
  } = opts

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
    .select('id, trigger_config, audience_filters')
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
  const eligible = matchConfig
    ? automations.filter((a) => matchConfig(a.trigger_config || {}))
    : automations

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
