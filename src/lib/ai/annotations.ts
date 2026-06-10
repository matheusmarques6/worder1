// =============================================
// Serviço de anotação de turnos / flywheel (Bloco F2)
//
// Escreve via service role (o caller passa getSupabaseAdmin()). RLS da
// tabela agent_trace_annotations é SELECT-only por org — igual a agent_traces
// e ai_agent_versions. Toda query é escopada pela org AUTENTICADA.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type Rating = 'good' | 'bad' | 'fix'

export interface Turn {
  /** id da trace anotada (chave do upsert) */
  id: string
  question: string
  answer: string
  /** ISO created_at da trace */
  date: string
  /** rótulo pré-existente, se já anotado */
  rating?: Rating
  /** texto da correção, quando rating === 'fix' */
  correction?: string
}

export interface FlywheelStats {
  annotated: number
  corrections: number
  for_fine_tune: number
  coverage: number
}

export interface AnnotationInput {
  trace_id: string
  rating: Rating | null
  correction_text?: string | null
}

const VALID_RATINGS: Rating[] = ['good', 'bad', 'fix']

/**
 * Calcula as métricas do flywheel a partir de contadores brutos.
 * PURA (sem I/O) — testada em flywheel.test.ts.
 *
 * - for_fine_tune = turnos "bons" + correções aplicadas (rating 'fix' com texto)
 * - coverage = % de traces anotadas (0 quando não há traces; nunca NaN)
 */
export function computeFlywheelStats(counts: {
  annotated: number
  corrections: number
  goodCount: number
  correctedFixCount: number
  totalTraces: number
}): FlywheelStats {
  const annotated = counts.annotated || 0
  const corrections = counts.corrections || 0
  const goodCount = counts.goodCount || 0
  const correctedFixCount = counts.correctedFixCount || 0
  const totalTraces = counts.totalTraces || 0

  const for_fine_tune = goodCount + correctedFixCount
  const coverage = totalTraces > 0 ? Math.round((annotated / totalTraces) * 100) : 0

  return { annotated, corrections, for_fine_tune, coverage }
}

/**
 * Lista as traces recentes do agente (na org autenticada) com a anotação
 * existente (LEFT JOIN), na forma consumida pela UI.
 */
export async function listRecentTurns(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  limit: number
): Promise<Turn[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20

  const { data: traces, error } = await supabase
    .from('agent_traces')
    .select('id, input, output, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(safeLimit)
  if (error) throw error

  const rows = traces ?? []
  if (rows.length === 0) return []

  const traceIds = rows.map((r) => r.id as string)
  const { data: annotations, error: annError } = await supabase
    .from('agent_trace_annotations')
    .select('trace_id, rating, correction_text')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .in('trace_id', traceIds)
  if (annError) throw annError

  const byTrace = new Map<string, { rating: Rating; correction_text: string | null }>()
  for (const a of annotations ?? []) {
    byTrace.set(a.trace_id as string, {
      rating: a.rating as Rating,
      correction_text: (a.correction_text as string | null) ?? null,
    })
  }

  return rows.map((r) => {
    const ann = byTrace.get(r.id as string)
    return {
      id: r.id as string,
      question: (r.input as string | null) ?? '',
      answer: (r.output as string | null) ?? '',
      date: r.created_at as string,
      ...(ann ? { rating: ann.rating } : {}),
      ...(ann?.correction_text ? { correction: ann.correction_text } : {}),
    }
  })
}

/**
 * Métricas do flywheel numa janela de 30 dias (org autenticada).
 * Delega o cálculo final à fn pura computeFlywheelStats.
 */
export async function getFlywheelStats(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string
): Promise<FlywheelStats> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Total de traces na janela (cobertura)
  const { count: totalTraces, error: tracesError } = await supabase
    .from('agent_traces')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .gte('created_at', since)
  if (tracesError) throw tracesError

  // Anotações na janela
  const { data: annotations, error: annError } = await supabase
    .from('agent_trace_annotations')
    .select('rating, correction_text')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .gte('created_at', since)
  if (annError) throw annError

  const rows = annotations ?? []
  let goodCount = 0
  let correctedFixCount = 0
  let corrections = 0
  for (const a of rows) {
    const rating = a.rating as Rating
    const hasText = typeof a.correction_text === 'string' && a.correction_text.trim().length > 0
    if (rating === 'good') goodCount += 1
    if (rating === 'fix' && hasText) {
      correctedFixCount += 1
      corrections += 1
    }
  }

  return computeFlywheelStats({
    annotated: rows.length,
    corrections,
    goodCount,
    correctedFixCount,
    totalTraces: totalTraces ?? 0,
  })
}

/**
 * Aplica um lote de anotações (org + autor autenticados):
 * - rating === null  → DELETA a anotação da trace (toggle-off na UI)
 * - rating válido    → upsert por trace_id
 * Cada trace_id é validado contra (agentId, orgId) antes de qualquer escrita.
 */
export async function saveAnnotations(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  userId: string | null,
  items: AnnotationInput[]
): Promise<{ saved: number; deleted: number }> {
  if (!Array.isArray(items) || items.length === 0) return { saved: 0, deleted: 0 }

  // Valida quais trace_id realmente pertencem a (agentId, orgId)
  const traceIds = Array.from(
    new Set(items.map((i) => i.trace_id).filter((id): id is string => Boolean(id)))
  )
  if (traceIds.length === 0) return { saved: 0, deleted: 0 }

  const { data: ownedTraces, error: ownErr } = await supabase
    .from('agent_traces')
    .select('id')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .in('id', traceIds)
  if (ownErr) throw ownErr

  const owned = new Set((ownedTraces ?? []).map((t) => t.id as string))

  const toDelete: string[] = []
  const toUpsert: Array<{
    organization_id: string
    agent_id: string
    trace_id: string
    rating: Rating
    correction_text: string | null
    annotated_by: string | null
    updated_at: string
  }> = []

  const now = new Date().toISOString()
  for (const item of items) {
    if (!owned.has(item.trace_id)) continue
    if (item.rating === null) {
      toDelete.push(item.trace_id)
    } else if (VALID_RATINGS.includes(item.rating)) {
      toUpsert.push({
        organization_id: orgId,
        agent_id: agentId,
        trace_id: item.trace_id,
        rating: item.rating,
        correction_text:
          item.rating === 'fix' && typeof item.correction_text === 'string'
            ? item.correction_text
            : null,
        annotated_by: userId,
        updated_at: now,
      })
    }
  }

  let deleted = 0
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('agent_trace_annotations')
      .delete()
      .eq('agent_id', agentId)
      .eq('organization_id', orgId)
      .in('trace_id', toDelete)
    if (delErr) throw delErr
    deleted = toDelete.length
  }

  let saved = 0
  if (toUpsert.length > 0) {
    const { error: upErr } = await supabase
      .from('agent_trace_annotations')
      .upsert(toUpsert, { onConflict: 'trace_id' })
    if (upErr) throw upErr
    saved = toUpsert.length
  }

  return { saved, deleted }
}
