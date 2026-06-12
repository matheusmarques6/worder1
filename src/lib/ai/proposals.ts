// =============================================
// Serviço de relatórios + sugestões de prompt (Bloco F5)
//
// - Agrega volume/qualidade/satisfação(estimada)/resolução por agente+período.
// - Gera sugestões de melhoria de prompt com UMA chamada de LLM (≤3 propostas,
//   ≤20 traces de origem), persiste em ai_prompt_proposals.
// - Aplica uma proposta: escreve ai_agents.system_prompt E cria uma versão
//   'produção' REUTILIZANDO o serviço de versões F1 (snapshotIfChanged) — sem
//   duplicar a lógica de versionamento.
//
// Escrita via service role (o caller passa getSupabaseAdmin()). RLS de
// ai_prompt_proposals é SELECT-only por org. Toda query é escopada pela org
// AUTENTICADA. CSAT: real (whatsapp_csat_ratings) quando amostra suficiente; senão proxy estimado pela IA (scoreToStars).
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIAgent } from './types'
import { callAI, type AIProvider } from '@/lib/whatsapp/ai-providers'
import { JUDGE_MODELS } from './judge'
import { resolveJudgeKey } from './judge-key'
import { trackAiUsage } from './cost-tracker'
import { checkAiBudget } from './budget'
import { diffLines, type DiffLine } from './diff'
import { snapshotIfChanged } from './versions'
import {
  buildDistribution,
  computeQualityScore,
  periodToRange,
  scoreToStars,
  resolveCsat,
  type CsatSummary,
} from './reports-metrics'

/** Cap duro: no máximo 3 propostas por geração, ≤20 traces de origem. */
export const MAX_PROPOSALS = 3
export const MAX_SOURCE_TRACES = 20

export type ReportPeriod = '7d' | '30d' | '90d'

// =============================================
// SHAPES DA UI (espelham ReportsView)
// =============================================

export interface ReportSummary {
  quality: number
  /** CSAT real (whatsapp_csat_ratings) quando amostra suficiente; senão proxy IA */
  csat: CsatSummary
  conversations: number
  resolutionRate: number
}

export interface ReportDistributionBar {
  stars: number
  pct: number
}

export interface Proposal {
  id: string
  title: string
  reason: string
  impact: string
  diff: DiffLine[]
}

export interface ReportPayload {
  summary: ReportSummary
  distribution: ReportDistributionBar[]
  proposals: Proposal[]
}

// Resolucao de chave do juiz agora vive em ./judge-key (BYO total, Onda 13.6).

// =============================================
// AGREGADOS (getReportSummary)
// =============================================

/**
 * Agrega métricas do agente no período. Degrada graciosamente quando uma fonte
 * está vazia. `csat` é a média de scoreToStars sobre as notas de juiz/cenário
 * (PROXY ESTIMADO, não CSAT real). `resolutionRate` = % de conversas (com este
 * ai_agent_id, no período) cujo ai_disabled_reason != 'transferred_to_human'.
 */
export async function getReportSummary(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  period: ReportPeriod
): Promise<{ summary: ReportSummary; distribution: ReportDistributionBar[] }> {
  const { sinceISO } = periodToRange(period)

  // --- notas do juiz (ai_eval_results) no período ---
  const { data: evalRows } = await supabase
    .from('ai_eval_results')
    .select('score, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .gte('created_at', sinceISO)
  const evalScores = (evalRows ?? [])
    .map((r) => r.score)
    .filter((s): s is number => typeof s === 'number')

  // --- notas de cenário (ai_scenario_runs) no período ---
  const { data: runRows } = await supabase
    .from('ai_scenario_runs')
    .select('score, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .gte('created_at', sinceISO)
  const runScores = (runRows ?? [])
    .map((r) => r.score)
    .filter((s): s is number => typeof s === 'number')

  const allScores = [...evalScores, ...runScores]
  const judgeAvg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null

  // --- anotações (good ratio) no período ---
  const { data: annRows } = await supabase
    .from('agent_trace_annotations')
    .select('rating, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .in('rating', ['good', 'bad', 'fix'])
    .gte('created_at', sinceISO)
  const anns = annRows ?? []
  const annotationGoodRatio =
    anns.length > 0 ? anns.filter((a) => a.rating === 'good').length / anns.length : null

  // --- conversas + resolução (whatsapp_cloud_conversations) no período ---
  const { data: convRows } = await supabase
    .from('whatsapp_cloud_conversations')
    .select('id, ai_disabled_reason, created_at')
    .eq('ai_agent_id', agentId)
    .eq('organization_id', orgId)
    .gte('created_at', sinceISO)
  const convs = convRows ?? []
  const conversations = convs.length
  const resolved = convs.filter((c) => c.ai_disabled_reason !== 'transferred_to_human').length
  const resolutionRate = conversations > 0 ? Math.round((resolved / conversations) * 100) : 0

  // --- score de qualidade (renormaliza pesos sobre os presentes) ---
  const quality = computeQualityScore({
    judgeAvg,
    annotationGoodRatio,
    resolutionRate: conversations > 0 ? resolutionRate : null,
  })

  // --- CSAT real (whatsapp_csat_ratings) das conversas deste agente ---
  // Vínculo honesto: conversation_id ∈ conversas com ai_agent_id = agente
  // (cloud + legado). NUNCA via csat.agent_id — lá é o ATENDENTE HUMANO.
  //
  // IMPORTANTE: NÃO filtrar agentConvIds por created_at — uma avaliação pode
  // ocorrer no período mas referenciar uma conversa criada antes do início do
  // mesmo (janela assimétrica). O filtro de data fica APENAS em csatRows
  // (gte created_at), não na lista de conversas elegíveis.
  // A query `convs` (whatsapp_cloud_conversations) mantém o gte p/ métricas
  // de volume/resolução — não mexer nela.
  const { data: cloudConvIdsRows } = await supabase
    .from('whatsapp_cloud_conversations')
    .select('id')
    .eq('ai_agent_id', agentId)
    .eq('organization_id', orgId)
    .limit(2000)
  const { data: legacyConvRows } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('ai_agent_id', agentId)
    .eq('organization_id', orgId)
    .limit(2000)
  const agentConvIds = new Set<string>([
    ...(cloudConvIdsRows ?? []).map((c) => c.id),
    ...(legacyConvRows ?? []).map((c) => c.id),
  ])

  const { data: csatRows } = await supabase
    .from('whatsapp_csat_ratings')
    .select('conversation_id, rating, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', sinceISO)
    .limit(2000)
  const realRatings = (csatRows ?? [])
    .filter((r) => agentConvIds.has(r.conversation_id))
    .map((r) => r.rating)
    .filter((r): r is number => typeof r === 'number')

  // --- CSAT: real quando amostra >= limiar; senão proxy estimado (juiz) ---
  const proxyStars = allScores.map((s) => scoreToStars(s))
  const { csat, starsForDistribution } = resolveCsat(realRatings, proxyStars)
  const distribution = buildDistribution(starsForDistribution)

  return {
    summary: { quality, csat, conversations, resolutionRate },
    distribution,
  }
}

// =============================================
// LISTAR PROPOSTAS (diff calculado em leitura)
// =============================================

interface ProposalRow {
  id: string
  title: string
  reason: string | null
  impact: string | null
  proposed_prompt: string
  status: string
  created_at: string
}

/**
 * Lista as propostas PENDENTES do agente, computando o diff NO MOMENTO DA
 * LEITURA contra o system_prompt ATUAL (sempre fresco) — não persistimos diff.
 */
export async function listProposals(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  currentSystemPrompt: string
): Promise<Proposal[]> {
  const { data: rows } = await supabase
    .from('ai_prompt_proposals')
    .select('id, title, reason, impact, proposed_prompt, status, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return ((rows ?? []) as ProposalRow[]).map((p) => ({
    id: p.id,
    title: p.title,
    reason: p.reason ?? '',
    impact: p.impact ?? '',
    diff: diffLines(currentSystemPrompt || '', p.proposed_prompt || ''),
  }))
}

// =============================================
// GERAR PROPOSTAS (1 chamada de LLM, ≤3 propostas)
// =============================================

const PROPOSALS_SYSTEM_PROMPT = `Você é um engenheiro de prompts especialista em atendimento ao cliente.
Recebe o PROMPT DE SISTEMA ATUAL de um agente e uma lista de SINAIS NEGATIVOS
(respostas mal avaliadas, anotações de erro e correções humanas). Proponha até 3
melhorias CONCRETAS no prompt de sistema.

Responda APENAS com um objeto JSON válido, sem texto fora dele, sem markdown:
{"proposals": [{"title": "<título curto>", "reason": "<por que, citando os sinais>", "impact": "<impacto esperado curto>", "proposed_prompt": "<PROMPT DE SISTEMA NOVO E COMPLETO>"}]}

Regras:
- proposed_prompt DEVE ser o prompt de sistema COMPLETO já reescrito (não um trecho).
- Cada proposta deve mudar algo de fato em relação ao prompt atual.
- No máximo 3 propostas. Se não houver sinais suficientes, devolva menos (ou nenhuma).
- pt-BR. Não invente sinais.`

interface ParsedProposal {
  title: string
  reason: string
  impact: string
  proposed_prompt: string
}

/** Parse defensivo da resposta do LLM de propostas. PURA, exportada e testada. */
export function parseProposalsJson(raw: string): ParsedProposal[] {
  if (typeof raw !== 'string') return []
  const text = raw.trim().replace(/```(?:json)?/gi, '').trim()
  if (!text) return []
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return []
  let obj: any
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.proposals)) return []
  return obj.proposals
    .filter(
      (p: any) =>
        p &&
        typeof p === 'object' &&
        typeof p.proposed_prompt === 'string' &&
        p.proposed_prompt.trim().length > 0
    )
    .slice(0, MAX_PROPOSALS)
    .map((p: any) => ({
      title: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : 'Melhoria de prompt',
      reason: typeof p.reason === 'string' ? p.reason : '',
      impact: typeof p.impact === 'string' ? p.impact : '',
      proposed_prompt: p.proposed_prompt,
    }))
}

/**
 * Coleta os piores sinais (anotações bad/fix + casos de avaliação com nota
 * baixa), faz UMA chamada de LLM pedindo ≤3 melhorias e persiste as propostas
 * (status pending, source_trace_ids). Não regenera nada se faltar API key.
 */
export async function generateProposals(
  supabase: SupabaseClient,
  agent: AIAgent,
  orgId: string,
  _userId: string | null
): Promise<void> {
  // (a) anotações negativas (bad/fix) com a trace correspondente.
  const { data: annRows } = await supabase
    .from('agent_trace_annotations')
    .select('trace_id, rating, correction_text')
    .eq('agent_id', agent.id)
    .eq('organization_id', orgId)
    .in('rating', ['bad', 'fix'])
    .order('created_at', { ascending: false })
    .limit(MAX_SOURCE_TRACES)
  const anns = annRows ?? []

  const traceIds = anns.map((a) => a.trace_id as string)
  const tracesById = new Map<string, { input: string; output: string }>()
  if (traceIds.length > 0) {
    const { data: traces } = await supabase
      .from('agent_traces')
      .select('id, input, output')
      .eq('agent_id', agent.id)
      .eq('organization_id', orgId)
      .in('id', traceIds)
    for (const t of traces ?? []) {
      tracesById.set(t.id as string, {
        input: (t.input as string | null) ?? '',
        output: (t.output as string | null) ?? '',
      })
    }
  }

  // (b) resultados de avaliação com nota mais baixa.
  const { data: lowResults } = await supabase
    .from('ai_eval_results')
    .select('score, judged_output')
    .eq('agent_id', agent.id)
    .eq('organization_id', orgId)
    .order('score', { ascending: true })
    .limit(MAX_SOURCE_TRACES)

  // Monta os sinais (cap total em MAX_SOURCE_TRACES).
  const signals: string[] = []
  const sourceTraceIds: string[] = []
  for (const a of anns) {
    const t = tracesById.get(a.trace_id as string)
    if (!t) continue
    sourceTraceIds.push(a.trace_id as string)
    const correction =
      a.rating === 'fix' && typeof a.correction_text === 'string' && a.correction_text
        ? ` | correção humana: ${a.correction_text}`
        : ''
    signals.push(
      `[anotação ${a.rating}] cliente: ${t.input.slice(0, 280)} | agente: ${t.output.slice(0, 280)}${correction}`
    )
    if (signals.length >= MAX_SOURCE_TRACES) break
  }
  for (const r of lowResults ?? []) {
    if (signals.length >= MAX_SOURCE_TRACES) break
    if (typeof r.score === 'number' && r.score < 60) {
      signals.push(
        `[avaliação nota ${r.score}] resposta: ${String(r.judged_output ?? '').slice(0, 280)}`
      )
    }
  }

  if (signals.length === 0) return // sem sinais → nada a propor

  // Budget check: 402 via AiBudgetExceededError (caller/rota captura)
  await checkAiBudget(orgId, { throwOnExceeded: true })

  const judge = await resolveJudgeKey(supabase, orgId, agent.provider)
  if (!judge) return
  const provider = judge.provider as AIProvider
  const apiKey = judge.apiKey
  const model = JUDGE_MODELS[provider] || JUDGE_MODELS.openai

  const userPrompt = [
    'PROMPT DE SISTEMA ATUAL:',
    agent.system_prompt || '(vazio)',
    '',
    'SINAIS NEGATIVOS:',
    signals.map((s, i) => `${i + 1}. ${s}`).join('\n'),
  ].join('\n')

  let parsed: ParsedProposal[]
  try {
    const response = await callAI(
      {
        provider,
        apiKey,
        model,
        temperature: 0.3,
        maxTokens: 2000,
        systemPrompt: PROPOSALS_SYSTEM_PROMPT,
      },
      [{ role: 'user', content: userPrompt }]
    )
    parsed = parseProposalsJson(response.content)
    // Track usage
    await trackAiUsage({
      organizationId: orgId,
      provider,
      model,
      feature: 'proposals_generate',
      agentId: agent.id,
      promptTokens: response.usage?.promptTokens,
      completionTokens: response.usage?.completionTokens,
      success: true,
    })
  } catch {
    return // falha na chamada → não quebra a UI
  }

  if (parsed.length === 0) return

  const rows = parsed.map((p) => ({
    organization_id: orgId,
    agent_id: agent.id,
    title: p.title,
    reason: p.reason,
    impact: p.impact,
    proposed_prompt: p.proposed_prompt,
    status: 'pending',
    source_trace_ids: sourceTraceIds,
  }))
  const { error } = await supabase.from('ai_prompt_proposals').insert(rows)
  if (error) throw error
}

// =============================================
// APLICAR / DISPENSAR PROPOSTA
// =============================================

/** Carrega uma proposta validando que pertence a (agente, org) e está pendente. */
async function loadPendingProposal(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  proposalId: string
): Promise<ProposalRow | null> {
  const { data } = await supabase
    .from('ai_prompt_proposals')
    .select('id, title, reason, impact, proposed_prompt, status, created_at')
    .eq('id', proposalId)
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .maybeSingle()
  return (data as ProposalRow | null) ?? null
}

/**
 * Aplica uma proposta: escreve proposed_prompt em ai_agents.system_prompt E cria
 * uma nova versão 'produção' REUTILIZANDO o serviço F1 (snapshotIfChanged) com
 * label = título da proposta. Resolve a versão criada e grava applied_version_id;
 * marca status 'applied'. Valida que a proposta ∈ (agente, org) e está pendente.
 */
export async function applyProposal(
  supabase: SupabaseClient,
  agent: AIAgent,
  orgId: string,
  proposalId: string,
  userId: string | null
): Promise<void> {
  const proposal = await loadPendingProposal(supabase, agent.id, orgId, proposalId)
  if (!proposal) throw new Error('Proposta não encontrada')

  // Só há versão nova quando o prompt de fato muda; senão snapshotIfChanged é
  // no-op e NÃO devemos apontar applied_version_id para uma versão pré-existente.
  const promptChanged = (agent.system_prompt ?? '') !== (proposal.proposed_prompt ?? '')

  // 1) cria a versão 'produção' a partir do estado pré-update (serviço F1).
  await snapshotIfChanged(
    supabase,
    {
      id: agent.id,
      organization_id: orgId,
      system_prompt: agent.system_prompt ?? null,
      persona: agent.persona ?? null,
      settings: agent.settings ?? null,
    },
    { system_prompt: proposal.proposed_prompt },
    userId,
    proposal.title
  )

  // 2) escreve o novo prompt no agente.
  const { error: updErr } = await supabase
    .from('ai_agents')
    .update({ system_prompt: proposal.proposed_prompt, updated_at: new Date().toISOString() })
    .eq('id', agent.id)
    .eq('organization_id', orgId)
  if (updErr) throw updErr

  // 3) resolve a versão 'produção' recém-criada para registrar applied_version_id
  //    (apenas quando o prompt mudou — caso contrário não há versão nova).
  let appliedVersionId: string | null = null
  if (promptChanged) {
    const { data: ver } = await supabase
      .from('ai_agent_versions')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('organization_id', orgId)
      .eq('status', 'produção')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    appliedVersionId = (ver?.id as string | undefined) ?? null
  }

  const { error: statusErr } = await supabase
    .from('ai_prompt_proposals')
    .update({ status: 'applied', applied_version_id: appliedVersionId })
    .eq('id', proposalId)
    .eq('agent_id', agent.id)
    .eq('organization_id', orgId)
  if (statusErr) throw statusErr
}

/** Marca a proposta como dispensada. Valida que ∈ (agente, org) e está pendente. */
export async function dismissProposal(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  proposalId: string
): Promise<void> {
  const proposal = await loadPendingProposal(supabase, agentId, orgId, proposalId)
  if (!proposal) throw new Error('Proposta não encontrada')

  const { error } = await supabase
    .from('ai_prompt_proposals')
    .update({ status: 'dismissed' })
    .eq('id', proposalId)
    .eq('agent_id', agentId)
    .eq('organization_id', orgId)
  if (error) throw error
}
