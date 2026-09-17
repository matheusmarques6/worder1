// =============================================
// Experimentos de popup — a parte com banco.
//
// Modelo: o popup "pai" é a variante A (controle). Cada variante extra é
// uma linha de crm_forms com ab_parent_id = pai, status 'draft' (nunca é
// publicada sozinha) e o próprio design_json. O comportamento (gatilhos,
// targeting, cupom) é sempre o do pai — o experimento testa o que a pessoa
// VÊ, com as mesmas regras de exibição.
//
// Uma linha em popup_experiments por experimento; só um 'running' por
// popup. O runtime recebe {split, variants[{id, design}]} e sorteia por
// visitante; eventos e inscrições carregam variant_id; popup_variant_stats
// agrega; evaluateExperiment decide; o cron aplica a vencedora.
// =============================================
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateExperiment,
  normalizeSplit,
  thompsonWeights,
  contextKey,
  type Evaluation,
  type ExperimentKpi,
  type VariantStats,
} from './experiments'

export interface ExperimentRow {
  id: string
  organization_id: string
  form_id: string
  name: string | null
  status: 'draft' | 'running' | 'ended'
  mode: 'split' | 'bandit'
  kpi: ExperimentKpi
  split: Record<string, number>
  min_sample: number
  max_days: number
  confidence: number
  auto_apply_winner: boolean
  bandit_min_views: number
  started_at: string | null
  ended_at: string | null
  winner_variant_id: string | null
  end_reason: string | null
  stats: Record<string, any>
  created_at: string
  updated_at: string
}

export interface VariantRow {
  id: string
  name: string
  status: string
  ab_variant: string | null
  ab_parent_id: string | null
  design_json: any
  updated_at: string
}

export interface ExperimentBundle {
  parent: { id: string; name: string; status: string; store_id: string | null }
  experiment: ExperimentRow | null
  variants: Array<{ id: string; label: string; name: string; is_control: boolean; status: string; updated_at: string }>
  split: Record<string, number>
  stats: VariantStats[]
  evaluation: Evaluation | null
}

const LABELS = ['A', 'B', 'C', 'D']
export const MAX_VARIANTS = 4

const EXPERIMENT_SELECT = 'id, organization_id, form_id, name, status, mode, kpi, split, min_sample, max_days, confidence, auto_apply_winner, bandit_min_views, started_at, ended_at, winner_variant_id, end_reason, stats, created_at, updated_at'

async function loadParent(admin: SupabaseClient, orgId: string, formId: string) {
  const { data, error } = await admin
    .from('crm_forms')
    .select('id, name, slug, status, store_id, design_json, behavior, form_type, ab_parent_id')
    .eq('id', formId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  if (data.ab_parent_id) throw new Error('Este popup é uma variante; abra o experimento pelo popup principal.')
  return data
}

export async function loadVariants(admin: SupabaseClient, orgId: string, formId: string): Promise<VariantRow[]> {
  const { data, error } = await admin
    .from('crm_forms')
    .select('id, name, status, ab_variant, ab_parent_id, design_json, updated_at')
    .eq('organization_id', orgId)
    .eq('ab_parent_id', formId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as VariantRow[]
}

export async function loadExperiment(admin: SupabaseClient, orgId: string, formId: string): Promise<ExperimentRow | null> {
  // O em andamento vence; senão o mais recente (rascunho ou encerrado).
  const { data, error } = await admin
    .from('popup_experiments')
    .select(EXPERIMENT_SELECT)
    .eq('organization_id', orgId)
    .eq('form_id', formId)
    .order('status', { ascending: false }) // running > ended > draft (ordem alfabética invertida)
    .order('updated_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(error.message)
  const rows = (data || []) as ExperimentRow[]
  return rows.find((r) => r.status === 'running') || rows.find((r) => r.status === 'draft') || rows[0] || null
}

function variantLabel(v: { ab_variant: string | null }, i: number): string {
  return v.ab_variant || LABELS[i + 1] || `V${i + 2}`
}

/** Os ids que entram no sorteio: pai + variantes. */
function splitIds(formId: string, variants: VariantRow[]): string[] {
  return [formId, ...variants.map((v) => v.id)]
}

export async function computeStats(admin: SupabaseClient, exp: ExperimentRow, controlId: string): Promise<{ stats: VariantStats[]; evaluation: Evaluation }> {
  const since = exp.started_at || exp.created_at
  // Encerrado: a leitura congela no fim; o tráfego que veio depois (todo
  // para a vencedora) não entra na conta.
  const until = exp.status === 'ended' ? exp.ended_at : null
  const { data, error } = await admin.rpc('popup_variant_stats', { p_organization_id: exp.organization_id, p_form_id: exp.form_id, p_since: since, p_until: until })
  if (error) throw new Error(error.message)
  const ids = Object.keys(exp.split || {})
  const byId = new Map<string, VariantStats>()
  for (const r of (data || []) as any[]) {
    byId.set(String(r.variant_id), {
      variantId: String(r.variant_id),
      impressions: Number(r.impressions) || 0,
      visitors: Number(r.visitors) || 0,
      submissions: Number(r.submissions) || 0,
      optins: Number(r.optins) || 0,
      orders: Number(r.orders) || 0,
      revenue: Number(r.revenue) || 0,
    })
  }
  // Só o controle e as variantes do experimento: um variant_id estranho
  // que chegasse ao banco não vira "variante" na leitura.
  const all = new Set([controlId, ...ids])
  const stats: VariantStats[] = [...all].map((id) => byId.get(id) || { variantId: id, impressions: 0, visitors: 0, submissions: 0, optins: 0, orders: 0, revenue: 0 })
  const evaluation = evaluateExperiment(stats, { kpi: exp.kpi, controlId, minSample: exp.min_sample, confidence: Number(exp.confidence) || 0.95 })
  return { stats, evaluation }
}

export async function getExperimentBundle(admin: SupabaseClient, orgId: string, formId: string): Promise<ExperimentBundle | null> {
  const parent = await loadParent(admin, orgId, formId)
  if (!parent) return null
  const [variants, experiment] = await Promise.all([loadVariants(admin, orgId, formId), loadExperiment(admin, orgId, formId)])
  const ids = splitIds(formId, variants)
  const split = normalizeSplit(experiment?.split, ids)
  let stats: VariantStats[] = []
  let evaluation: Evaluation | null = null
  if (experiment && experiment.status !== 'draft') {
    try {
      const r = await computeStats(admin, { ...experiment, split }, formId)
      stats = r.stats
      evaluation = r.evaluation
    } catch (e: any) {
      console.warn('[Experiments] stats failed:', e?.message)
    }
  }
  return {
    parent: { id: parent.id, name: parent.name, status: parent.status, store_id: parent.store_id },
    experiment,
    variants: [
      { id: parent.id, label: 'A', name: parent.name, is_control: true, status: parent.status, updated_at: '' },
      ...variants.map((v, i) => ({ id: v.id, label: variantLabel(v, i), name: v.name, is_control: false, status: v.status, updated_at: v.updated_at })),
    ],
    split,
    stats,
    evaluation,
  }
}

async function ensureDraftExperiment(admin: SupabaseClient, orgId: string, formId: string, split: Record<string, number>): Promise<ExperimentRow> {
  const cur = await loadExperiment(admin, orgId, formId)
  if (cur && cur.status !== 'ended') {
    const { data, error } = await admin.from('popup_experiments').update({ split, updated_at: new Date().toISOString() }).eq('id', cur.id).select(EXPERIMENT_SELECT).single()
    if (error) throw new Error(error.message)
    return data as ExperimentRow
  }
  const { data, error } = await admin
    .from('popup_experiments')
    .insert({ organization_id: orgId, form_id: formId, status: 'draft', split })
    .select(EXPERIMENT_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as ExperimentRow
}

/** Cria a próxima variante (cópia do pai) e garante o experimento em rascunho. */
export async function createVariant(admin: SupabaseClient, orgId: string, formId: string): Promise<{ variant: VariantRow; experiment: ExperimentRow }> {
  const parent = await loadParent(admin, orgId, formId)
  if (!parent) throw new Error('Popup não encontrado')
  const exp = await loadExperiment(admin, orgId, formId)
  if (exp?.status === 'running') throw new Error('Encerre o experimento em andamento antes de criar variantes.')
  const existing = await loadVariants(admin, orgId, formId)
  if (existing.length + 1 >= MAX_VARIANTS) throw new Error(`No máximo ${MAX_VARIANTS} variantes, contando a principal.`)
  const label = LABELS[existing.length + 1]
  // slug é obrigatório e único por org.
  const slugBase = String(parent.slug || parent.name || 'popup').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'popup'
  const { data, error } = await admin
    .from('crm_forms')
    .insert({
      organization_id: orgId,
      store_id: parent.store_id,
      slug: `${slugBase}-${label.toLowerCase()}-${Date.now().toString(36)}`,
      name: `${parent.name} · Variante ${label}`,
      form_type: parent.form_type,
      status: 'draft',
      design_json: parent.design_json,
      behavior: parent.behavior,
      is_ab_test: true,
      ab_variant: label,
      ab_parent_id: parent.id,
    })
    .select('id, name, status, ab_variant, ab_parent_id, design_json, updated_at')
    .single()
  if (error) throw new Error(error.message)
  const variant = data as VariantRow
  const ids = splitIds(formId, [...existing, variant])
  const experiment = await ensureDraftExperiment(admin, orgId, formId, normalizeSplit(exp?.split, ids))
  return { variant, experiment }
}

export async function removeVariant(admin: SupabaseClient, orgId: string, formId: string, variantId: string): Promise<void> {
  const exp = await loadExperiment(admin, orgId, formId)
  if (exp?.status === 'running') throw new Error('Encerre o experimento antes de remover variantes.')
  const { error } = await admin.from('crm_forms').delete().eq('id', variantId).eq('organization_id', orgId).eq('ab_parent_id', formId)
  if (error) throw new Error(error.message)
  if (exp && exp.status !== 'ended') {
    const rest = await loadVariants(admin, orgId, formId)
    await admin.from('popup_experiments').update({ split: normalizeSplit(exp.split, splitIds(formId, rest)), updated_at: new Date().toISOString() }).eq('id', exp.id)
  }
}

export interface ExperimentPatch {
  name?: string
  split?: Record<string, unknown>
  kpi?: ExperimentKpi
  mode?: 'split' | 'bandit'
  min_sample?: number
  max_days?: number
  confidence?: number
  auto_apply_winner?: boolean
  bandit_min_views?: number
}

export async function updateExperiment(admin: SupabaseClient, orgId: string, formId: string, patch: ExperimentPatch): Promise<ExperimentRow> {
  const parent = await loadParent(admin, orgId, formId)
  if (!parent) throw new Error('Popup não encontrado')
  const running = await loadExperiment(admin, orgId, formId)
  if (running?.status === 'running' && Object.keys(patch).some((k) => k !== 'name')) {
    throw new Error('Experimento em andamento: encerre antes de mudar as regras.')
  }
  const variants = await loadVariants(admin, orgId, formId)
  const ids = splitIds(formId, variants)
  const cur = await ensureDraftExperiment(admin, orgId, formId, normalizeSplit((await loadExperiment(admin, orgId, formId))?.split, ids))
  const upd: Record<string, any> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) upd.name = String(patch.name).slice(0, 120) || null
  if (patch.split !== undefined) upd.split = normalizeSplit(patch.split as any, ids)
  if (patch.kpi && ['submit', 'optin', 'revenue'].includes(patch.kpi)) upd.kpi = patch.kpi
  if (patch.mode && ['split', 'bandit'].includes(patch.mode)) upd.mode = patch.mode
  if (patch.min_sample !== undefined) upd.min_sample = Math.min(100000, Math.max(20, Math.round(Number(patch.min_sample) || 200)))
  if (patch.max_days !== undefined) upd.max_days = Math.min(180, Math.max(1, Math.round(Number(patch.max_days) || 30)))
  if (patch.confidence !== undefined) upd.confidence = [0.9, 0.95, 0.99].includes(Number(patch.confidence)) ? Number(patch.confidence) : 0.95
  if (patch.auto_apply_winner !== undefined) upd.auto_apply_winner = !!patch.auto_apply_winner
  if (patch.bandit_min_views !== undefined) upd.bandit_min_views = Math.min(1000000, Math.max(100, Math.round(Number(patch.bandit_min_views) || 10000)))
  const { data, error } = await admin.from('popup_experiments').update(upd).eq('id', cur.id).eq('organization_id', orgId).select(EXPERIMENT_SELECT).single()
  if (error) throw new Error(error.message)
  return data as ExperimentRow
}

export async function startExperiment(admin: SupabaseClient, orgId: string, formId: string): Promise<ExperimentRow> {
  const parent = await loadParent(admin, orgId, formId)
  if (!parent) throw new Error('Popup não encontrado')
  const variants = await loadVariants(admin, orgId, formId)
  if (!variants.length) throw new Error('Crie pelo menos uma variante antes de iniciar.')
  const ids = splitIds(formId, variants)
  const cur = await ensureDraftExperiment(admin, orgId, formId, normalizeSplit((await loadExperiment(admin, orgId, formId))?.split, ids))
  if (cur.status === 'running') return cur
  const split = normalizeSplit(cur.split, ids)
  const live = Object.values(split).filter((w) => w > 0).length
  if (live < 2) throw new Error('A divisão precisa dar tráfego a pelo menos duas variantes.')
  const { data, error } = await admin
    .from('popup_experiments')
    .update({ status: 'running', started_at: new Date().toISOString(), ended_at: null, winner_variant_id: null, end_reason: null, stats: {}, split, updated_at: new Date().toISOString() })
    .eq('id', cur.id)
    .eq('organization_id', orgId)
    .select(EXPERIMENT_SELECT)
    .single()
  if (error) throw new Error(error.message)
  // O bundle da loja tem ETag pelo updated_at do popup: mexe nele para o
  // experimento entrar no ar em até um minuto.
  await admin.from('crm_forms').update({ updated_at: new Date().toISOString() }).eq('id', formId).eq('organization_id', orgId)
  return data as ExperimentRow
}

export async function stopExperiment(admin: SupabaseClient, orgId: string, formId: string, reason = 'manual'): Promise<ExperimentRow | null> {
  const parent = await loadParent(admin, orgId, formId)
  if (!parent) throw new Error('Popup não encontrado')
  const cur = await loadExperiment(admin, orgId, formId)
  if (!cur || cur.status !== 'running') return cur
  const { data, error } = await admin
    .from('popup_experiments')
    .update({ status: 'ended', ended_at: new Date().toISOString(), end_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', cur.id)
    .eq('organization_id', orgId)
    .select(EXPERIMENT_SELECT)
    .single()
  if (error) throw new Error(error.message)
  await admin.from('crm_forms').update({ updated_at: new Date().toISOString() }).eq('id', formId).eq('organization_id', orgId)
  return data as ExperimentRow
}

/**
 * Aplica a vencedora: se for uma variante, o design dela vira o design do
 * pai (o comportamento não muda). Encerra o experimento com o motivo.
 */
export async function applyWinner(admin: SupabaseClient, orgId: string, formId: string, winnerId: string, reason = 'manual_apply'): Promise<ExperimentRow | null> {
  const cur = await loadExperiment(admin, orgId, formId)
  if (!cur) throw new Error('Sem experimento para este popup.')
  // Aplicar de novo trocaria os designs outra vez, devolvendo a perdedora
  // ao ar (dois cliques, ou o cron aplicando junto com o lojista).
  if (cur.status === 'ended') throw new Error('Experimento já encerrado — a vencedora já está no ar.')
  if (winnerId !== formId) {
    const { data: v, error } = await admin
      .from('crm_forms')
      .select('id, design_json, ab_variant')
      .eq('id', winnerId)
      .eq('organization_id', orgId)
      .eq('ab_parent_id', formId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!v) throw new Error('Variante não encontrada.')
    // O design do pai não some: fica guardado na própria variante como
    // "era assim antes" para quem quiser voltar.
    const { data: parent } = await admin.from('crm_forms').select('design_json').eq('id', formId).maybeSingle()
    // As regras de exibição são do popup principal — a variante só muda o
    // que aparece. O design vencedor entra com o behavior do pai.
    const parentBehavior = (parent?.design_json as any)?.behavior
    const winnerDesign = parentBehavior && v.design_json && typeof v.design_json === 'object'
      ? { ...(v.design_json as any), behavior: parentBehavior }
      : v.design_json
    const { error: upErr } = await admin
      .from('crm_forms')
      .update({ design_json: winnerDesign, updated_at: new Date().toISOString() })
      .eq('id', formId)
      .eq('organization_id', orgId)
    if (upErr) throw new Error(upErr.message)
    await admin
      .from('crm_forms')
      .update({ design_json: parent?.design_json || {}, name: `${(await admin.from('crm_forms').select('name').eq('id', formId).maybeSingle()).data?.name || 'Popup'} · Anterior à ${v.ab_variant || 'variante'}`, updated_at: new Date().toISOString() })
      .eq('id', winnerId)
  }
  const { data, error } = await admin
    .from('popup_experiments')
    .update({ status: 'ended', ended_at: new Date().toISOString(), winner_variant_id: winnerId, end_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', cur.id)
    .eq('organization_id', orgId)
    .select(EXPERIMENT_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as ExperimentRow
}

/** Pesos do bandit por contexto (página × origem × dispositivo), com Thompson. */
export async function computeBanditWeights(admin: SupabaseClient, exp: ExperimentRow, controlId: string): Promise<{ weights: Record<string, Record<string, number>>; eligible: boolean; views: Record<string, number> }> {
  const since = exp.started_at || exp.created_at
  const { data, error } = await admin.rpc('popup_variant_context_stats', { p_organization_id: exp.organization_id, p_form_id: exp.form_id, p_since: since, p_until: null })
  if (error) throw new Error(error.message)
  const ids = Object.keys(exp.split || {})
  const views: Record<string, number> = {}
  const byCtx: Record<string, Record<string, { successes: number; trials: number }>> = {}
  for (const r of (data || []) as any[]) {
    const vid = String(r.variant_id)
    const key = contextKey(r.page_kind, r.traffic_type, r.device)
    views[vid] = (views[vid] || 0) + (Number(r.impressions) || 0)
    byCtx[key] = byCtx[key] || {}
    byCtx[key][vid] = { successes: Number(r.submissions) || 0, trials: Number(r.impressions) || 0 }
  }
  const eligible = ids.every((id) => (views[id] || 0) >= exp.bandit_min_views)
  const weights: Record<string, Record<string, number>> = {}
  if (eligible) {
    for (const [key, arms] of Object.entries(byCtx)) {
      const list = ids.map((id) => ({ id, successes: arms[id]?.successes || 0, trials: arms[id]?.trials || 0 }))
      // Contexto com pouca observação segue o split fixo.
      if (list.reduce((s, a) => s + a.trials, 0) < 200) continue
      const w = thompsonWeights(list)
      weights[key] = Object.fromEntries(Object.entries(w).map(([id, v]) => [id, Math.round(v * 100)]))
    }
  }
  return { weights, eligible, views }
}

/** O cron: avalia cada experimento em andamento e aplica o que couber. */
export async function resolveRunningExperiments(admin: SupabaseClient, opts: { limit?: number; now?: Date } = {}): Promise<Array<{ id: string; form_id: string; outcome: string }>> {
  const now = opts.now || new Date()
  const { data, error } = await admin
    .from('popup_experiments')
    .select(EXPERIMENT_SELECT)
    .eq('status', 'running')
    .order('updated_at', { ascending: true })
    .limit(opts.limit || 50)
  if (error) throw new Error(error.message)
  const out: Array<{ id: string; form_id: string; outcome: string }> = []
  for (const exp of (data || []) as ExperimentRow[]) {
    try {
      const { stats, evaluation } = await computeStats(admin, exp, exp.form_id)
      const statsBlob: Record<string, any> = { computed_at: now.toISOString(), evaluation, stats }
      let bandit: Awaited<ReturnType<typeof computeBanditWeights>> | null = null
      if (exp.mode === 'bandit') {
        bandit = await computeBanditWeights(admin, exp, exp.form_id)
        statsBlob.bandit = { eligible: bandit.eligible, views: bandit.views, weights: bandit.weights }
      }
      const startedAt = exp.started_at ? new Date(exp.started_at).getTime() : now.getTime()
      const expired = now.getTime() - startedAt > exp.max_days * 86400000

      if (evaluation.ready && evaluation.winnerId && exp.mode === 'split') {
        if (exp.auto_apply_winner) {
          await admin.from('popup_experiments').update({ stats: statsBlob }).eq('id', exp.id)
          await applyWinner(admin, exp.organization_id, exp.form_id, evaluation.winnerId, evaluation.reason === 'control_wins' ? 'auto_control_wins' : 'auto_winner')
          await admin.from('crm_forms').update({ updated_at: now.toISOString() }).eq('id', exp.form_id)
          out.push({ id: exp.id, form_id: exp.form_id, outcome: `applied:${evaluation.winnerId}` })
          continue
        }
        // Sem auto-aplicar: registra e deixa o lojista decidir.
        await admin.from('popup_experiments').update({ stats: statsBlob, winner_variant_id: evaluation.winnerId, updated_at: now.toISOString() }).eq('id', exp.id)
        out.push({ id: exp.id, form_id: exp.form_id, outcome: `winner_pending:${evaluation.winnerId}` })
        continue
      }
      if (expired) {
        await admin.from('popup_experiments').update({ stats: statsBlob, status: 'ended', ended_at: now.toISOString(), end_reason: 'max_days', updated_at: now.toISOString() }).eq('id', exp.id)
        await admin.from('crm_forms').update({ updated_at: now.toISOString() }).eq('id', exp.form_id)
        out.push({ id: exp.id, form_id: exp.form_id, outcome: 'ended:max_days' })
        continue
      }
      const banditChanged = bandit && JSON.stringify(bandit.weights) !== JSON.stringify(exp.stats?.bandit?.weights || {})
      await admin.from('popup_experiments').update({ stats: statsBlob, updated_at: now.toISOString() }).eq('id', exp.id)
      if (banditChanged) await admin.from('crm_forms').update({ updated_at: now.toISOString() }).eq('id', exp.form_id)
      out.push({ id: exp.id, form_id: exp.form_id, outcome: evaluation.reason })
    } catch (e: any) {
      console.warn('[Experiments] resolve failed:', exp.id, e?.message)
      out.push({ id: exp.id, form_id: exp.form_id, outcome: `error:${e?.message}` })
    }
  }
  return out
}

/** O que o runtime recebe: sorteio, designs das variantes e pesos do bandit. */
export interface RuntimeExperiment {
  id: string
  mode: 'split' | 'bandit'
  split: Record<string, number>
  variants: Array<{ id: string; design: any }>
  bandit?: Record<string, Record<string, number>>
  /** Muda quando qualquer variante é editada — entra no ETag do bundle. */
  version: string
}

/**
 * Para o bundle: anexa o experimento em andamento (e as variantes) a cada
 * popup publicado. Um popup sem experimento recebe null.
 */
export async function attachExperiments<T extends { id: string; organization_id?: string; design_json?: any }>(
  admin: SupabaseClient,
  forms: T[],
): Promise<Map<string, RuntimeExperiment>> {
  const out = new Map<string, RuntimeExperiment>()
  if (!forms.length) return out
  const ids = forms.map((f) => f.id)
  // Sempre dentro das orgs dos popups pedidos — o bundle de uma loja nunca
  // carrega o design de uma variante de outra org.
  const orgIds = [...new Set(forms.map((f) => f.organization_id).filter(Boolean))] as string[]
  let expQuery = admin.from('popup_experiments').select(EXPERIMENT_SELECT).in('form_id', ids).eq('status', 'running')
  if (orgIds.length) expQuery = expQuery.in('organization_id', orgIds)
  const { data: exps } = await expQuery
  const running = (exps || []) as ExperimentRow[]
  if (!running.length) return out
  let vQuery = admin.from('crm_forms').select('id, ab_parent_id, design_json, updated_at, organization_id').in('ab_parent_id', running.map((e) => e.form_id))
  if (orgIds.length) vQuery = vQuery.in('organization_id', orgIds)
  const { data: vrows } = await vQuery
  const variantsByParent = new Map<string, Array<{ id: string; design: any; updated_at: string }>>()
  for (const v of (vrows || []) as any[]) {
    const list = variantsByParent.get(v.ab_parent_id) || []
    list.push({ id: v.id, design: v.design_json || {}, updated_at: String(v.updated_at || '') })
    variantsByParent.set(v.ab_parent_id, list)
  }
  for (const e of running) {
    const variants = variantsByParent.get(e.form_id) || []
    if (!variants.length) continue
    const split = normalizeSplit(e.split, [e.form_id, ...variants.map((v) => v.id)])
    const bandit = e.mode === 'bandit' && e.stats?.bandit?.eligible ? (e.stats.bandit.weights as Record<string, Record<string, number>>) : undefined
    const version = `${e.updated_at}|${variants.map((v) => v.updated_at).sort().join(',')}`
    out.set(e.form_id, { id: e.id, mode: e.mode, split, variants: variants.map((v) => ({ id: v.id, design: v.design })), bandit, version })
  }
  return out
}
