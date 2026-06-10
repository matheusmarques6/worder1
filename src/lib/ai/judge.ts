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
