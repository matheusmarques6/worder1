// =============================================
// Juiz LLM compartilhado (Bloco F3 — reutilizado por F4/F5)
//
// Avalia um transcript completo (cenário rodado contra o agente) com UMA
// chamada ao provider, temperature 0 e rubrica JSON-only. A escolha de modelo
// usa o tier barato por provider (JUDGE_MODELS), evitando custo alto.
//
// Lookup de API key espelha engine.ts (api_keys por org+provider, fallback
// OPENAI_API_KEY). O caller passa a apiKey já resolvida.
// =============================================

import { callAI, type AIProvider } from '@/lib/whatsapp/ai-providers'

/** Tier barato por provider — chaveado pelo provider do agente. */
export const JUDGE_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  gemini: 'gemini-1.5-flash',
  google: 'gemini-1.5-flash',
  groq: 'llama-3.1-8b-instant',
  deepseek: 'deepseek-chat',
}

export interface JudgeFlag {
  /** índice do turno (no transcript completo) que está sendo sinalizado */
  turn_index: number
  /** rótulo curto do problema (ex.: "Sem acolhimento") */
  label: string
  /** problema grave (rebaixa o status para 'grave') */
  severe?: boolean
}

export interface JudgeVerdict {
  /** nota 0-100 */
  score: number
  /** nota textual curta do juiz */
  note: string
  /** sinalizações por turno */
  flags: JudgeFlag[]
}

/** Linha de transcript consumida pelo juiz e pela UI. */
export interface TranscriptLine {
  role: 'them' | 'me'
  text: string
  flag?: string
}

const JUDGE_SYSTEM_PROMPT = `Você é um avaliador rigoroso e imparcial de conversas de atendimento.
Recebe a persona do agente, o comportamento esperado e um transcript numerado
(role "them" = cliente, role "me" = agente). Avalie SOMENTE os turnos do agente ("me").

Responda APENAS com um objeto JSON válido, sem texto fora dele, sem markdown, no formato:
{"score": <0-100>, "note": "<resumo curto em pt-BR>", "flags": [{"turn_index": <int>, "label": "<rótulo curto>", "severe": <true|false>}]}

Regras:
- score: 0-100 (quão bem o agente atendeu o comportamento esperado).
- flags: aponte turnos do agente problemáticos por turn_index (índice 0-based no transcript fornecido). Use "severe": true para erros graves (ex.: conselho indevido, informação inventada, recusa de encaminhar quando deveria).
- Se não houver problemas, "flags": [].
- Não invente turnos. turn_index deve existir no transcript.`

/**
 * Constrói o prompt do usuário com persona, comportamento esperado e o
 * transcript numerado. PURO (sem I/O) — fácil de raciocinar/testar.
 */
function buildJudgeUserPrompt(args: {
  persona?: string
  expectedBehavior?: string
  transcript: TranscriptLine[]
}): string {
  const lines = args.transcript
    .map((m, i) => `[${i}] (${m.role === 'me' ? 'agente' : 'cliente'}) ${m.text}`)
    .join('\n')
  return [
    args.persona ? `Persona do cliente: ${args.persona}` : '',
    args.expectedBehavior ? `Comportamento esperado do agente: ${args.expectedBehavior}` : '',
    'Transcript (turn_index entre colchetes):',
    lines,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Faz parse defensivo da resposta do juiz. PURA, exportada e testada.
 * - Tira ```code fences``` e prosa antes/depois do JSON.
 * - JSON.parse; valida score (number, clamp 0-100); flags vira [] se ausente/ inválido.
 * - Retorna null em lixo (sem JSON parseável ou sem score numérico).
 */
export function parseJudgeJson(raw: string): JudgeVerdict | null {
  if (typeof raw !== 'string') return null

  let text = raw.trim()
  if (!text) return null

  // Remove cercas de código ```json ... ``` ou ``` ... ```
  text = text.replace(/```(?:json)?/gi, '').trim()

  // Isola o primeiro objeto JSON balanceado (descarta prosa antes/depois).
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const candidate = text.slice(start, end + 1)

  let obj: any
  try {
    obj = JSON.parse(candidate)
  } catch {
    return null
  }

  if (!obj || typeof obj !== 'object') return null
  if (typeof obj.score !== 'number' || Number.isNaN(obj.score)) return null

  const score = Math.max(0, Math.min(100, Math.round(obj.score)))
  const note = typeof obj.note === 'string' ? obj.note : ''

  const flags: JudgeFlag[] = Array.isArray(obj.flags)
    ? obj.flags
        .filter(
          (f: any) =>
            f &&
            typeof f === 'object' &&
            typeof f.turn_index === 'number' &&
            Number.isFinite(f.turn_index) &&
            typeof f.label === 'string'
        )
        .map((f: any) => ({
          turn_index: Math.trunc(f.turn_index),
          label: f.label,
          ...(f.severe === true ? { severe: true } : {}),
        }))
    : []

  return { score, note, flags }
}

export interface JudgeArgs {
  provider: AIProvider
  apiKey: string
  /** modelo do juiz; default JUDGE_MODELS[provider] */
  model?: string
  persona?: string
  expectedBehavior?: string
  transcript: TranscriptLine[]
}

// =============================================
// Juiz de CASO (Bloco F4) — avalia UMA resposta contra uma rubrica de
// critérios, com saída JSON por-critério (pass/fail) + nota global. Reutiliza
// o mesmo provider/modelo/temperature do juiz de transcript (ONE judge module).
// =============================================

/** Critério da rubrica passado ao juiz de caso. */
export interface JudgeCriterion {
  id: string
  label: string
  description?: string
}

/** Resultado por-critério devolvido pelo juiz de caso. */
export interface CriterionResult {
  id: string
  pass: boolean
}

export interface CaseVerdict {
  /** nota 0-100 */
  score: number
  /** pass quando todos os critérios passam, senão fail */
  verdict: 'pass' | 'fail'
  /** veredito por-critério */
  criteria: CriterionResult[]
  /** nota textual curta do juiz */
  note: string
}

const JUDGE_CASE_SYSTEM_PROMPT = `Você é um avaliador rigoroso e imparcial de respostas de atendimento.
Recebe a pergunta do cliente, a resposta do agente, (opcionalmente) a resposta esperada e uma lista numerada de critérios.
Avalie a resposta do agente contra CADA critério.

Responda APENAS com um objeto JSON válido, sem texto fora dele, sem markdown, no formato:
{"score": <0-100>, "note": "<resumo curto em pt-BR>", "criteria": [{"id": "<id do critério>", "pass": <true|false>}]}

Regras:
- score: 0-100 (qualidade geral da resposta perante os critérios).
- criteria: um item por critério fornecido, usando o "id" exato dado. pass=true se a resposta atende ao critério.
- Não invente critérios nem ids. Inclua TODOS os critérios fornecidos.`

/** Constrói o prompt do usuário do juiz de caso. PURO. */
function buildCaseUserPrompt(args: {
  input: string
  output: string
  expected?: string
  criteria: JudgeCriterion[]
}): string {
  const crit = args.criteria
    .map((c, i) => `[${i}] id=${c.id} — ${c.label}${c.description ? `: ${c.description}` : ''}`)
    .join('\n')
  return [
    `Pergunta do cliente: ${args.input || '(vazia)'}`,
    `Resposta do agente: ${args.output || '(vazia)'}`,
    args.expected ? `Resposta esperada (referência): ${args.expected}` : '',
    'Critérios a avaliar:',
    crit,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Parse defensivo da resposta do juiz de caso. PURA, exportada e testada.
 * Reconcilia os ids contra a rubrica fornecida (critérios ausentes → fail).
 */
export function parseCaseJson(
  raw: string,
  criteria: JudgeCriterion[]
): CaseVerdict | null {
  if (typeof raw !== 'string') return null
  let text = raw.trim().replace(/```(?:json)?/gi, '').trim()
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  let obj: any
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  if (typeof obj.score !== 'number' || Number.isNaN(obj.score)) return null

  const score = Math.max(0, Math.min(100, Math.round(obj.score)))
  const note = typeof obj.note === 'string' ? obj.note : ''

  const byId = new Map<string, boolean>()
  if (Array.isArray(obj.criteria)) {
    for (const c of obj.criteria) {
      if (c && typeof c === 'object' && typeof c.id === 'string') {
        byId.set(c.id, c.pass === true)
      }
    }
  }
  // Reconcilia contra a rubrica fornecida (ausente → fail).
  const results: CriterionResult[] = criteria.map((c) => ({
    id: c.id,
    pass: byId.get(c.id) === true,
  }))
  const verdict: 'pass' | 'fail' = results.every((r) => r.pass) ? 'pass' : 'fail'
  return { score, verdict, criteria: results, note }
}

export interface JudgeCaseArgs {
  provider: AIProvider
  apiKey: string
  model?: string
  input: string
  output: string
  expected?: string
  criteria: JudgeCriterion[]
}

/**
 * Avalia UMA resposta contra a rubrica com UMA chamada ao provider
 * (temperature 0, JSON-only). Em falha de parse, devolve um veredito neutro
 * (score 0, todos os critérios fail) para não quebrar o run.
 */
export async function judgeCase(args: JudgeCaseArgs): Promise<CaseVerdict> {
  const model = args.model || JUDGE_MODELS[args.provider] || JUDGE_MODELS.openai

  const response = await callAI(
    {
      provider: args.provider,
      apiKey: args.apiKey,
      model,
      temperature: 0,
      maxTokens: 600,
      systemPrompt: JUDGE_CASE_SYSTEM_PROMPT,
    },
    [
      {
        role: 'user',
        content: buildCaseUserPrompt({
          input: args.input,
          output: args.output,
          expected: args.expected,
          criteria: args.criteria,
        }),
      },
    ]
  )

  const parsed = parseCaseJson(response.content, args.criteria)
  if (parsed) return parsed

  return {
    score: 0,
    verdict: 'fail',
    criteria: args.criteria.map((c) => ({ id: c.id, pass: false })),
    note: 'Não foi possível interpretar a avaliação do juiz.',
  }
}

/**
 * Avalia um transcript com UMA chamada ao provider (cap de custo: 1 call/transcript).
 * temperature 0, rubrica JSON-only. Em falha de parse, retorna um veredito
 * neutro sinalizado (score 0, flag severa) para não quebrar o run.
 */
export async function judgeTranscript(args: JudgeArgs): Promise<JudgeVerdict> {
  const model = args.model || JUDGE_MODELS[args.provider] || JUDGE_MODELS.openai

  const response = await callAI(
    {
      provider: args.provider,
      apiKey: args.apiKey,
      model,
      temperature: 0,
      maxTokens: 800,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
    },
    [
      {
        role: 'user',
        content: buildJudgeUserPrompt({
          persona: args.persona,
          expectedBehavior: args.expectedBehavior,
          transcript: args.transcript,
        }),
      },
    ]
  )

  const parsed = parseJudgeJson(response.content)
  if (parsed) return parsed

  // Fallback defensivo: o juiz devolveu algo não-parseável.
  return {
    score: 0,
    note: 'Não foi possível interpretar a avaliação do juiz.',
    flags: [{ turn_index: 0, label: 'Avaliação inválida', severe: true }],
  }
}
