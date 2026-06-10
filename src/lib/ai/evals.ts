// =============================================
// Serviço de avaliação (Bloco F4)
//
// Materializa casos de avaliação (de anotações + cenários), roda o juiz LLM
// compartilhado (judgeCase) com rubrica por-critério e persiste resultados.
// Calcula a concordância juiz×humano (Cohen's kappa) sobre A MESMA resposta
// armazenada da trace anotada.
//
// Escrita via service role (o caller passa getSupabaseAdmin()). RLS das tabelas
// ai_eval_* é SELECT-only por org. Toda query é escopada pela org AUTENTICADA.
// Cap de custo: ≤20 casos julgados por run, 1 chamada de juiz por caso.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIAgent } from './types'
import { type AIProvider } from '@/lib/whatsapp/ai-providers'
import { judgeCase, JUDGE_MODELS, type JudgeCriterion } from './judge'
import {
  cohenKappa,
  buildKappaRows,
  type KappaPair,
  type KappaRow,
  type TagGroup,
} from './agreement'

/** Limite duro de casos julgados por execução (cap de custo). */
export const MAX_CASES_PER_RUN = 20

// =============================================
// SHAPES DA UI (espelham os mocks de EvalView)
// =============================================

export interface Version {
  id: string
  tag: string
  label: string
  /** média de score dos resultados nesta versão; null quando sem resultados */
  score: number | null
  date: string
  current?: boolean
}

export interface Criterion {
  id: string
  label: string
  pass: boolean
  detail: string
}

export type CaseVerdictKind = 'pass' | 'fail'

export interface EvalCase {
  id: string
  title: string
  input: string
  verdict: CaseVerdictKind
  score: number
  tags: string[]
}

export interface EvalPayload {
  versions: Version[]
  criteria: Criterion[]
  kappa: KappaRow[]
  cases: EvalCase[]
}

// =============================================
// CRITÉRIOS PADRÃO (semeados no primeiro run)
// =============================================

const DEFAULT_CRITERIA: Array<{ label: string; description: string }> = [
  { label: 'Responde no escopo', description: 'Não opina fora do domínio do agente.' },
  { label: 'Tom adequado', description: 'Mantém o tom apropriado ao contexto e ao cliente.' },
  { label: 'Usa as fontes/RAG', description: 'Apoia a resposta em fontes verificáveis quando aplicável.' },
  { label: 'Precisão de valores', description: 'Valores e dados conferem com a base; não inventa.' },
  { label: 'Encaminha quando deve', description: 'Encaminha a humano nos casos que exigem.' },
]

// =============================================
// FUNÇÕES PURAS (testadas)
// =============================================

interface ResultRow {
  case_id: string | null
  version_id: string | null
  verdict: CaseVerdictKind | null
  score: number | null
  criteria_results: unknown
  created_at: string
}

interface CriterionRow {
  id: string
  label: string
  description: string | null
}

/**
 * Resume cada critério a partir dos resultados MAIS RECENTES por caso:
 * veredito por maioria (>= metade dos casos passando → pass) e um detalhe que
 * cita a contagem de falhas. PURA, testada.
 */
export function summarizeCriteria(
  criteria: CriterionRow[],
  results: Array<{ criteria_results: unknown }>
): Criterion[] {
  return criteria.map((crit) => {
    let pass = 0
    let fail = 0
    for (const r of results) {
      const arr = Array.isArray(r.criteria_results) ? (r.criteria_results as any[]) : []
      const hit = arr.find((c) => c && typeof c === 'object' && c.id === crit.id)
      if (!hit) continue
      if (hit.pass === true) pass += 1
      else fail += 1
    }
    const total = pass + fail
    const majorityPass = total === 0 ? true : pass >= fail
    let detail: string
    if (total === 0) {
      detail = crit.description || 'Sem casos avaliados ainda.'
    } else if (fail === 0) {
      detail = crit.description || `Passou em todos os ${total} casos.`
    } else {
      detail = `Falhou em ${fail} de ${total} casos.`
    }
    return { id: crit.id, label: crit.label, pass: majorityPass, detail }
  })
}

/**
 * Anexa a média de score por version_id às versões. PURA, testada.
 * Versão sem resultados → score null.
 */
export function versionScores(
  versions: Version[],
  results: Array<{ version_id: string | null; score: number | null }>
): Version[] {
  const sum = new Map<string, { total: number; n: number }>()
  for (const r of results) {
    if (!r.version_id || typeof r.score !== 'number') continue
    const acc = sum.get(r.version_id) ?? { total: 0, n: 0 }
    acc.total += r.score
    acc.n += 1
    sum.set(r.version_id, acc)
  }
  return versions.map((v) => {
    const acc = sum.get(v.id)
    return { ...v, score: acc && acc.n > 0 ? Math.round(acc.total / acc.n) : null }
  })
}

// =============================================
// HELPERS DE LOOKUP (espelham test-runner.ts)
// =============================================

async function resolveApiKey(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string
): Promise<string> {
  const { data } = await supabase
    .from('api_keys')
    .select('api_key')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .single()
  return data?.api_key || process.env.OPENAI_API_KEY || ''
}

async function resolveProductionVersionId(
  supabase: SupabaseClient,
  agentId: string,
  organizationId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('ai_agent_versions')
    .select('id')
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .eq('status', 'produção')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

// =============================================
// SEED DE CRITÉRIOS
// =============================================

/** Semeia os 5 critérios padrão quando o agente ainda não tem nenhum. Idempotente. */
async function seedCriteriaIfNone(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string
): Promise<void> {
  const { count } = await supabase
    .from('ai_eval_criteria')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
  if ((count ?? 0) > 0) return

  const rows = DEFAULT_CRITERIA.map((c, i) => ({
    organization_id: orgId,
    agent_id: agentId,
    label: c.label,
    description: c.description,
    position: i,
    is_active: true,
  }))
  const { error } = await supabase.from('ai_eval_criteria').insert(rows)
  if (error) throw error
}

// =============================================
// SYNC DE CASOS (materializa de anotações + cenários)
// =============================================

/**
 * Materializa ai_eval_cases a partir de:
 * (a) agent_trace_annotations com rating em ('bad','fix') →
 *     input = trace.input, expected = fix.correction_text (bad → ''),
 *     source='annotation', source_id = trace_id.
 * (b) ai_test_scenarios → title, input = primeiro user_turn,
 *     source='scenario', source_id = scenario_id, tags = scenario.tags.
 * Upsert na UNIQUE(agent_id, source, source_id). Idempotente.
 */
export async function syncCases(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string
): Promise<void> {
  const rows: Array<{
    organization_id: string
    agent_id: string
    title: string
    input: string
    expected: string
    source: 'annotation' | 'scenario'
    source_id: string
    tags: string[]
  }> = []

  // (a) anotações bad/fix → casos
  const { data: anns, error: annErr } = await supabase
    .from('agent_trace_annotations')
    .select('trace_id, rating, correction_text')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .in('rating', ['bad', 'fix'])
  if (annErr) throw annErr

  const traceIds = (anns ?? []).map((a) => a.trace_id as string)
  const tracesById = new Map<string, { input: string }>()
  if (traceIds.length > 0) {
    const { data: traces, error: trErr } = await supabase
      .from('agent_traces')
      .select('id, input')
      .eq('agent_id', agentId)
      .eq('organization_id', orgId)
      .in('id', traceIds)
    if (trErr) throw trErr
    for (const t of traces ?? []) {
      tracesById.set(t.id as string, { input: (t.input as string | null) ?? '' })
    }
  }

  for (const a of anns ?? []) {
    const trace = tracesById.get(a.trace_id as string)
    if (!trace) continue
    const expected =
      a.rating === 'fix' && typeof a.correction_text === 'string' ? a.correction_text : ''
    const input = trace.input || ''
    rows.push({
      organization_id: orgId,
      agent_id: agentId,
      title: input ? input.slice(0, 80) : 'Turno anotado',
      input,
      expected,
      source: 'annotation',
      source_id: a.trace_id as string,
      tags: [],
    })
  }

  // (b) cenários ativos → casos
  const { data: scenarios, error: scErr } = await supabase
    .from('ai_test_scenarios')
    .select('id, title, user_turns, tags')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .eq('is_active', true)
  if (scErr) throw scErr

  for (const s of scenarios ?? []) {
    const turns = Array.isArray(s.user_turns)
      ? (s.user_turns as unknown[]).filter((t): t is string => typeof t === 'string')
      : []
    rows.push({
      organization_id: orgId,
      agent_id: agentId,
      title: (s.title as string) || 'Cenário',
      input: turns[0] ?? '',
      expected: '',
      source: 'scenario',
      source_id: s.id as string,
      tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
    })
  }

  if (rows.length === 0) return
  const { error } = await supabase
    .from('ai_eval_cases')
    .upsert(rows, { onConflict: 'agent_id,source,source_id' })
  if (error) throw error
}

// =============================================
// RUN DA AVALIAÇÃO (juiz cap 20)
// =============================================

interface CaseRow {
  id: string
  title: string
  input: string | null
  expected: string | null
  source: string | null
  source_id: string | null
  tags: string[] | null
}

/**
 * Resolve o output a julgar para um caso:
 * - annotation: output ARMAZENADO da trace (sem regeneração) — chave do join kappa.
 * - scenario:   resposta final do agente no ai_scenario_runs mais recente.
 */
async function resolveJudgedOutput(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  c: CaseRow
): Promise<string | null> {
  if (c.source === 'annotation' && c.source_id) {
    const { data } = await supabase
      .from('agent_traces')
      .select('output')
      .eq('id', c.source_id)
      .eq('agent_id', agentId)
      .eq('organization_id', orgId)
      .maybeSingle()
    return (data?.output as string | null) ?? null
  }
  if (c.source === 'scenario' && c.source_id) {
    const { data } = await supabase
      .from('ai_scenario_runs')
      .select('transcript, created_at')
      .eq('scenario_id', c.source_id)
      .eq('agent_id', agentId)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const transcript = Array.isArray(data?.transcript) ? (data!.transcript as any[]) : []
    // última resposta do agente ('me')
    for (let i = transcript.length - 1; i >= 0; i--) {
      const line = transcript[i]
      if (line && line.role === 'me' && typeof line.text === 'string') return line.text
    }
    return null
  }
  return null
}

/**
 * Roda a avaliação: semeia critérios se não houver, sincroniza casos, e julga
 * até MAX_CASES_PER_RUN casos (1 chamada de juiz por caso) sobre o output
 * ARMAZENADO. Persiste uma linha em ai_eval_results por caso julgado.
 */
export async function runEvaluation(
  supabase: SupabaseClient,
  agent: AIAgent,
  orgId: string,
  _userId: string | null
): Promise<void> {
  await seedCriteriaIfNone(supabase, agent.id, orgId)
  await syncCases(supabase, agent.id, orgId)

  const { data: critRows, error: critErr } = await supabase
    .from('ai_eval_criteria')
    .select('id, label, description')
    .eq('agent_id', agent.id)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('position', { ascending: true })
  if (critErr) throw critErr

  const criteria: JudgeCriterion[] = (critRows ?? []).map((c) => ({
    id: c.id as string,
    label: c.label as string,
    description: (c.description as string | null) ?? undefined,
  }))
  if (criteria.length === 0) return

  const { data: caseRows, error: caseErr } = await supabase
    .from('ai_eval_cases')
    .select('id, title, input, expected, source, source_id, tags')
    .eq('agent_id', agent.id)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(MAX_CASES_PER_RUN)
  if (caseErr) throw caseErr

  const cases = (caseRows ?? []) as CaseRow[]
  if (cases.length === 0) return

  const apiKey = await resolveApiKey(supabase, orgId, agent.provider)
  if (!apiKey) return
  const provider = agent.provider as AIProvider
  const judgeModel = JUDGE_MODELS[provider] || JUDGE_MODELS.openai
  const versionId = await resolveProductionVersionId(supabase, agent.id, orgId)

  for (const c of cases) {
    const output = await resolveJudgedOutput(supabase, agent.id, orgId, c)
    if (output === null) continue // sem resposta armazenada → não há o que julgar

    let verdict
    try {
      verdict = await judgeCase({
        provider,
        apiKey,
        model: judgeModel,
        input: c.input ?? '',
        output,
        expected: c.expected ?? undefined,
        criteria,
      })
    } catch {
      verdict = {
        score: 0,
        verdict: 'fail' as const,
        criteria: criteria.map((cr) => ({ id: cr.id, pass: false })),
        note: 'Falha ao chamar o juiz.',
      }
    }

    const { error: insErr } = await supabase.from('ai_eval_results').insert({
      organization_id: orgId,
      agent_id: agent.id,
      case_id: c.id,
      version_id: versionId,
      verdict: verdict.verdict,
      score: verdict.score,
      criteria_results: verdict.criteria,
      judge_model: judgeModel,
      judged_output: output,
    })
    if (insErr) throw insErr
  }
}

// =============================================
// LIST (monta os 4 shapes da UI a partir dos resultados armazenados)
// =============================================

/**
 * Monta o payload da UI a partir das linhas armazenadas:
 * - cases: cada caso + seu resultado MAIS RECENTE.
 * - criteria: resumo por critério (summarizeCriteria) sobre os últimos resultados.
 * - kappa: concordância juiz×humano sobre as anotações que viraram resultado.
 * - versions: versões + média de score por versão (versionScores).
 */
export async function listEval(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string
): Promise<EvalPayload> {
  // Critérios
  const { data: critRows } = await supabase
    .from('ai_eval_criteria')
    .select('id, label, description')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('position', { ascending: true })
  const criteriaRows: CriterionRow[] = (critRows ?? []).map((c) => ({
    id: c.id as string,
    label: c.label as string,
    description: (c.description as string | null) ?? null,
  }))

  // Casos
  const { data: caseRows } = await supabase
    .from('ai_eval_cases')
    .select('id, title, input, source, source_id, tags')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  const cases = (caseRows ?? []) as Array<CaseRow & { tags: string[] | null }>

  // Resultados (mais recente primeiro) — último por caso.
  const { data: resRows } = await supabase
    .from('ai_eval_results')
    .select('case_id, version_id, verdict, score, criteria_results, judged_output, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  const allResults = (resRows ?? []) as Array<ResultRow & { judged_output: string | null }>

  const latestByCase = new Map<string, ResultRow & { judged_output: string | null }>()
  for (const r of allResults) {
    if (r.case_id && !latestByCase.has(r.case_id)) latestByCase.set(r.case_id, r)
  }
  const latestResults = Array.from(latestByCase.values())

  // ---- cases (shape UI) ----
  const evalCases: EvalCase[] = cases
    .map((c) => {
      const r = latestByCase.get(c.id)
      if (!r) return null
      return {
        id: c.id,
        title: c.title,
        input: c.input ?? '',
        verdict: (r.verdict ?? 'fail') as CaseVerdictKind,
        score: typeof r.score === 'number' ? r.score : 0,
        tags: Array.isArray(c.tags) ? c.tags : [],
      }
    })
    .filter((x): x is EvalCase => x !== null)

  // ---- criteria (shape UI) ----
  const criteria = summarizeCriteria(criteriaRows, latestResults)

  // ---- versions (shape UI) ----
  const { data: verRows } = await supabase
    .from('ai_agent_versions')
    .select('id, version_number, label, status, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .order('version_number', { ascending: true })
  const verList = verRows ?? []
  const maxNumber = verList.length > 0 ? verList[verList.length - 1].version_number : 0
  const versionsBase: Version[] = verList
    .map((v) => ({
      id: v.id as string,
      tag: `v${v.version_number}`,
      label: v.label as string,
      score: null as number | null,
      date: v.created_at as string,
      current: v.version_number === maxNumber,
    }))
    .reverse()
  const versions = versionScores(versionsBase, latestResults)

  // ---- kappa (concordância juiz×humano sobre anotações) ----
  const kappa = await buildKappa(supabase, agentId, orgId, cases, latestByCase)

  return { versions, criteria, kappa, cases: evalCases }
}

/**
 * Monta as linhas de kappa: junta cada caso de ANOTAÇÃO ao seu resultado mais
 * recente e à anotação humana sobre a MESMA trace. human = 'good'→pass,
 * 'bad'/'fix'→fail; judge = verdict do resultado. Segmenta por tag.
 */
async function buildKappa(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  cases: Array<CaseRow & { tags: string[] | null }>,
  latestByCase: Map<string, ResultRow & { judged_output: string | null }>
): Promise<KappaRow[]> {
  const annotationCases = cases.filter(
    (c) => c.source === 'annotation' && c.source_id && latestByCase.has(c.id)
  )
  if (annotationCases.length === 0) {
    // Sem base humana: ainda devolvemos a linha geral (insuficiente).
    return buildKappaRows([], [])
  }

  const traceIds = annotationCases.map((c) => c.source_id as string)
  const { data: anns } = await supabase
    .from('agent_trace_annotations')
    .select('trace_id, rating')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .in('trace_id', traceIds)
  const ratingByTrace = new Map<string, string>()
  for (const a of anns ?? []) ratingByTrace.set(a.trace_id as string, a.rating as string)

  const pairs: KappaPair[] = []
  const byTag = new Map<string, KappaPair[]>()
  for (const c of annotationCases) {
    const rating = ratingByTrace.get(c.source_id as string)
    if (!rating) continue
    const r = latestByCase.get(c.id)!
    const human = rating === 'good'
    const judge = (r.verdict ?? 'fail') === 'pass'
    const pair: KappaPair = { human, judge }
    pairs.push(pair)
    for (const tag of c.tags ?? []) {
      const arr = byTag.get(tag) ?? []
      arr.push(pair)
      byTag.set(tag, arr)
    }
  }

  const tagGroups: TagGroup[] = Array.from(byTag.entries()).map(([tag, ps]) => ({
    id: `tag-${tag}`,
    label: tag,
    pairs: ps,
  }))

  return buildKappaRows(pairs, tagGroups)
}

// Reexport para consumidores (rota/tests).
export { cohenKappa, type KappaRow, type KappaPair }
