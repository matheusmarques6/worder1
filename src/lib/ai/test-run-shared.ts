// =============================================
// Tipos e funções PURAS do test-run (Bloco F3)
//
// ⚠️ Este módulo é CLIENT-SAFE: não pode importar nada server-side
// (engine, callAI, supabase-admin). Ele existe exatamente para que a UI
// (TestRunView) compartilhe tipos/cálculos com o test-runner sem arrastar
// o grafo server-side para o bundle do browser.
// =============================================

export interface JudgeFlag {
  /** índice do turno (no transcript completo) que está sendo sinalizado */
  turn_index: number
  /** rótulo curto do problema (ex.: "Sem acolhimento") */
  label: string
  /** problema grave (rebaixa o status para 'grave') */
  severe?: boolean
}

/** Linha de transcript consumida pelo juiz e pela UI. */
export interface TranscriptLine {
  role: 'them' | 'me'
  text: string
  flag?: string
}

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
