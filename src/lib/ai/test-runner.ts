// =============================================
// Test-runner de cenários (Bloco F3)
//
// Executa cenários de teste contra um agente real (via processWithAgent — a
// mesma fn que /test usa), avalia o transcript com o juiz LLM compartilhado e
// persiste o run em ai_scenario_runs.
//
// Escrita via service role (o caller passa getSupabaseAdmin()). Toda query é
// escopada pela org AUTENTICADA. Custo controlado: ≤10 cenários/run, 1 chamada
// de juiz por cenário, 1 chamada para gerar cenários quando não há nenhum.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { processWithAgent } from './engine'
import type { AIAgent, EngineMessage } from './types'
import { callAI, type AIProvider } from '@/lib/whatsapp/ai-providers'
import {
  judgeTranscript,
  JUDGE_MODELS,
  type JudgeFlag,
  type TranscriptLine,
} from './judge'

/** Limite duro de cenários por execução (cap de custo). */
export const MAX_SCENARIOS_PER_RUN = 10

export type ScenarioStatus = 'pass' | 'flag' | 'grave'

/** Shape consumido pela UI (TestRunView). */
export interface ScenarioResult {
  id: string
  title: string
  persona: string
  /** null quando o cenário ainda não foi executado */
  score: number | null
  status: ScenarioStatus | null
  note?: string
  transcript: TranscriptLine[]
}

export interface ScenarioSummary {
  avg: number
  passed: number
  flagged: number
}

// =============================================
// FUNÇÕES PURAS (testadas)
// =============================================

/**
 * Deriva o status de um run a partir da nota e das flags. PURA, testada.
 * - grave: score < 50 OU alguma flag.severe
 * - flag:  50 <= score < 85 OU alguma flag (não severa)
 * - pass:  caso contrário
 */
export function deriveRunStatus(score: number, flags: JudgeFlag[]): ScenarioStatus {
  const hasSevere = Array.isArray(flags) && flags.some((f) => f?.severe === true)
  const hasAnyFlag = Array.isArray(flags) && flags.length > 0
  if (score < 50 || hasSevere) return 'grave'
  if (score < 85 || hasAnyFlag) return 'flag'
  return 'pass'
}

/**
 * Resumo agregado dos cenários (cabeçalho do Test-run). PURA, testada.
 * - avg: média das notas (arredondada); 0 em lista vazia ou sem notas.
 * - passed: status === 'pass'
 * - flagged: status !== 'pass' (inclui não-executados/sinalizados)
 * Espelha o cálculo client-side original do TestRunView.
 */
export function buildScenarioSummary(scenarios: ScenarioResult[]): ScenarioSummary {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return { avg: 0, passed: 0, flagged: 0 }
  }
  const scored = scenarios.filter((s) => typeof s.score === 'number') as Array<
    ScenarioResult & { score: number }
  >
  const avg =
    scored.length > 0
      ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length)
      : 0
  const passed = scenarios.filter((s) => s.status === 'pass').length
  const flagged = scenarios.filter((s) => s.status !== 'pass').length
  return { avg, passed, flagged }
}

// =============================================
// HELPERS DE LOOKUP (espelham engine.ts)
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

/** version_id do run = versão 'produção' atual do agente, se existir. */
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
// GERAÇÃO DE CENÁRIOS (1 chamada LLM)
// =============================================

interface GeneratedScenario {
  title: string
  persona: string
  user_turns: string[]
  expected_behavior: string
  tags: string[]
}

const GEN_SYSTEM_PROMPT = `Você gera cenários de teste para avaliar um agente de atendimento.
Gere EXATAMENTE 4 cenários cobrindo: (1) caminho feliz, (2) cliente irritado pedindo reembolso,
(3) pergunta fora do escopo, (4) pedido de atendimento humano (handoff).

Responda APENAS com um array JSON válido, sem markdown, no formato:
[{"title": "...", "persona": "...", "user_turns": ["msg1","msg2"], "expected_behavior": "...", "tags": ["tag"]}]

Cada cenário tem 1 a 3 user_turns (mensagens do cliente, em pt-BR). Não inclua respostas do agente.`

/** Parse defensivo do array de cenários gerados pelo LLM. PURO. */
export function parseGeneratedScenarios(raw: string): GeneratedScenario[] {
  if (typeof raw !== 'string') return []
  let text = raw.trim().replace(/```(?:json)?/gi, '').trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  let arr: any
  try {
    arr = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter(
      (s: any) =>
        s &&
        typeof s === 'object' &&
        typeof s.title === 'string' &&
        Array.isArray(s.user_turns) &&
        s.user_turns.some((t: any) => typeof t === 'string' && t.trim())
    )
    .map((s: any) => ({
      title: String(s.title).slice(0, 200),
      persona: typeof s.persona === 'string' ? s.persona : 'Cliente',
      user_turns: s.user_turns.filter((t: any) => typeof t === 'string' && t.trim()).slice(0, 3),
      expected_behavior: typeof s.expected_behavior === 'string' ? s.expected_behavior : '',
      tags: Array.isArray(s.tags) ? s.tags.filter((t: any) => typeof t === 'string').slice(0, 5) : [],
    }))
    .slice(0, 4)
}

/**
 * Quando o agente não tem cenários, gera 4 via LLM (1 chamada) a partir da
 * persona + system_prompt e os insere em ai_test_scenarios. Retorna as linhas
 * inseridas. Em falha (parse vazio / sem API key), insere nada e retorna [].
 */
export async function generateScenarios(
  supabase: SupabaseClient,
  agent: AIAgent,
  organizationId: string,
  userId: string | null
): Promise<any[]> {
  const apiKey = await resolveApiKey(supabase, organizationId, agent.provider)
  if (!apiKey) return []

  const provider = agent.provider as AIProvider
  const personaDesc = agent.persona?.role_description || ''
  const userPrompt = [
    `Nome do agente: ${agent.name}`,
    personaDesc ? `Persona: ${personaDesc}` : '',
    agent.system_prompt ? `Instruções do agente:\n${agent.system_prompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  let generated: GeneratedScenario[] = []
  try {
    const res = await callAI(
      {
        provider,
        apiKey,
        model: JUDGE_MODELS[provider] || JUDGE_MODELS.openai,
        temperature: 0.4,
        maxTokens: 1200,
        systemPrompt: GEN_SYSTEM_PROMPT,
      },
      [{ role: 'user', content: userPrompt }]
    )
    generated = parseGeneratedScenarios(res.content)
  } catch {
    generated = []
  }

  if (generated.length === 0) return []

  const rows = generated.map((g) => ({
    organization_id: organizationId,
    agent_id: agent.id,
    title: g.title,
    persona: g.persona,
    user_turns: g.user_turns,
    expected_behavior: g.expected_behavior,
    tags: g.tags,
    is_active: true,
    created_by: userId,
  }))

  const { data, error } = await supabase.from('ai_test_scenarios').insert(rows).select('*')
  if (error) throw error
  return data ?? []
}

// =============================================
// EXECUÇÃO DE CENÁRIOS
// =============================================

interface ScenarioRow {
  id: string
  title: string
  persona: string | null
  user_turns: unknown
  expected_behavior: string | null
}

function normalizeUserTurns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
}

/**
 * Roda UM cenário: percorre user_turns chamando processWithAgent acumulando o
 * histórico, monta o transcript, chama o juiz (1 call) e anexa as flags aos
 * turnos do agente ('me') por turn_index. NÃO persiste (o caller persiste).
 */
async function runSingleScenario(
  scenario: ScenarioRow,
  agent: AIAgent,
  organizationId: string,
  apiKey: string
): Promise<{ transcript: TranscriptLine[]; score: number; status: ScenarioStatus; note: string; tokens: number; judgeModel: string }> {
  const provider = agent.provider as AIProvider
  const judgeModel = JUDGE_MODELS[provider] || JUDGE_MODELS.openai
  const userTurns = normalizeUserTurns(scenario.user_turns)

  const transcript: TranscriptLine[] = []
  const history: EngineMessage[] = []
  let tokens = 0

  for (const userTurn of userTurns) {
    transcript.push({ role: 'them', text: userTurn })
    try {
      const result = await processWithAgent(
        agent.id,
        organizationId,
        userTurn,
        [...history],
        `test-run-${scenario.id}`
      )
      transcript.push({ role: 'me', text: result.response })
      tokens += result.tokens_used || 0
      history.push({ role: 'user', content: userTurn })
      history.push({ role: 'assistant', content: result.response })
    } catch (err: any) {
      transcript.push({ role: 'me', text: `[erro ao executar o agente: ${err?.message || 'desconhecido'}]` })
      // continua os demais turnos para um transcript completo
    }
  }

  // Juiz (1 chamada). Em falha de chamada, veredito neutro sinalizado.
  let verdict
  try {
    verdict = await judgeTranscript({
      provider,
      apiKey,
      model: judgeModel,
      persona: scenario.persona ?? undefined,
      expectedBehavior: scenario.expected_behavior ?? undefined,
      transcript,
    })
  } catch {
    verdict = {
      score: 0,
      note: 'Falha ao chamar o juiz.',
      flags: [{ turn_index: 0, label: 'Juiz indisponível', severe: true }],
    }
  }

  // Anexa flags aos turnos do agente ('me') por turn_index.
  for (const flag of verdict.flags) {
    const line = transcript[flag.turn_index]
    if (line && line.role === 'me') {
      line.flag = flag.label
    }
  }

  const status = deriveRunStatus(verdict.score, verdict.flags)
  return { transcript, score: verdict.score, status, note: verdict.note, tokens, judgeModel }
}

/**
 * Executa um conjunto de cenários (cap MAX_SCENARIOS_PER_RUN), persiste cada
 * run em ai_scenario_runs e devolve o shape consumido pela UI.
 *
 * @param scenarioIds 'all' para todos os cenários ativos, ou um subconjunto de ids.
 */
export async function runScenarios(
  supabase: SupabaseClient,
  agent: AIAgent,
  organizationId: string,
  scenarioIds: string[] | 'all',
  userId: string | null
): Promise<ScenarioResult[]> {
  // Carrega cenários ativos do agente (escopados por org).
  let query = supabase
    .from('ai_test_scenarios')
    .select('id, title, persona, user_turns, expected_behavior')
    .eq('agent_id', agent.id)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (scenarioIds !== 'all') {
    const ids = scenarioIds.filter((id) => typeof id === 'string' && id)
    if (ids.length === 0) return []
    query = query.in('id', ids)
  }

  const { data: scenarios, error } = await query
  if (error) throw error

  const toRun = (scenarios ?? []).slice(0, MAX_SCENARIOS_PER_RUN) as ScenarioRow[]
  if (toRun.length === 0) return []

  const apiKey = await resolveApiKey(supabase, organizationId, agent.provider)
  const versionId = await resolveProductionVersionId(supabase, agent.id, organizationId)

  const results: ScenarioResult[] = []
  for (const scenario of toRun) {
    const run = await runSingleScenario(scenario, agent, organizationId, apiKey)

    const { error: insertError } = await supabase.from('ai_scenario_runs').insert({
      organization_id: organizationId,
      agent_id: agent.id,
      scenario_id: scenario.id,
      version_id: versionId,
      transcript: run.transcript,
      score: run.score,
      status: run.status,
      note: run.note,
      judge_model: run.judgeModel,
      tokens: run.tokens,
      created_by: userId,
    })
    if (insertError) throw insertError

    results.push({
      id: scenario.id,
      title: scenario.title,
      persona: scenario.persona ?? '',
      score: run.score,
      status: run.status,
      ...(run.note ? { note: run.note } : {}),
      transcript: run.transcript,
    })
  }

  return results
}

/**
 * Lista cada cenário ativo dobrado com seu run MAIS RECENTE (sem run → status
 * null / "não executado"). Shape consumido pela UI no GET.
 */
export async function listScenariosWithLatestRun(
  supabase: SupabaseClient,
  agentId: string,
  organizationId: string
): Promise<ScenarioResult[]> {
  const { data: scenarios, error } = await supabase
    .from('ai_test_scenarios')
    .select('id, title, persona, user_turns, expected_behavior')
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (scenarios ?? []) as ScenarioRow[]
  if (rows.length === 0) return []

  // Run mais recente por cenário.
  const { data: runs, error: runsError } = await supabase
    .from('ai_scenario_runs')
    .select('scenario_id, transcript, score, status, note, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .in(
      'scenario_id',
      rows.map((r) => r.id)
    )
    .order('created_at', { ascending: false })
  if (runsError) throw runsError

  const latestByScenario = new Map<string, any>()
  for (const run of runs ?? []) {
    if (!latestByScenario.has(run.scenario_id as string)) {
      latestByScenario.set(run.scenario_id as string, run)
    }
  }

  return rows.map((scenario) => {
    const run = latestByScenario.get(scenario.id)
    if (!run) {
      return {
        id: scenario.id,
        title: scenario.title,
        persona: scenario.persona ?? '',
        score: null,
        status: null,
        transcript: [],
      }
    }
    return {
      id: scenario.id,
      title: scenario.title,
      persona: scenario.persona ?? '',
      score: typeof run.score === 'number' ? run.score : null,
      status: (run.status as ScenarioStatus | null) ?? null,
      ...(run.note ? { note: run.note as string } : {}),
      transcript: Array.isArray(run.transcript) ? (run.transcript as TranscriptLine[]) : [],
    }
  })
}
