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
  for (const auto of eligible) {
    const metadata: Record<string, any> = {
      trigger_data: triggerData,
      trigger_type: triggerType,
    }
    if (idempotencyKey) metadata.idempotency_key = idempotencyKey

    const insertData: Record<string, any> = {
      organization_id: organizationId,
      automation_id: auto.id,
      contact_id: contactId || null,
      deal_id: dealId || null,
      status: scheduledFor ? 'waiting' : 'pending',
      metadata,
    }
    if (scheduledFor) {
      insertData.waiting_until = scheduledFor
    }

    const { data, error: insertErr } = await supabaseAdmin
      .from('automation_runs')
      .insert(insertData)
      .select('id')
      .single()

    if (insertErr) {
      console.error('[dispatchTrigger] insert run error:', insertErr)
      continue
    }
    if (data?.id) runIds.push(data.id)
  }

  return {
    automationsMatched: eligible.length,
    runsCreated: runIds.length,
    runIds,
  }
}
