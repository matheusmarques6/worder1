// =============================================
// Concordância juiz × humano (Bloco F4) — PURO, testado
//
// Cohen's kappa entre o rótulo humano (anotação) e o veredito do juiz LLM
// sobre A MESMA resposta armazenada (output da trace anotada). Sem I/O.
// =============================================

/** Par humano↔juiz sobre o MESMO caso (binário pass/fail). */
export interface KappaPair {
  /** rótulo humano: true = pass (anotação 'good'), false = fail ('bad'/'fix') */
  human: boolean
  /** veredito do juiz: true = pass, false = fail */
  judge: boolean
}

/** Linha de concordância consumida pela UI. */
export interface KappaRow {
  id: string
  label: string
  /** 0-1; ausente quando o segmento tem dados insuficientes (<10 pares) */
  value?: number
  /** true quando há <10 pares → UI mostra "dados insuficientes" */
  insufficient?: boolean
}

/** Mínimo de pares para um kappa confiável. */
export const MIN_KAPPA_PAIRS = 10

/**
 * Cohen's kappa para dois avaliadores binários. PURA, testada.
 * - <10 pares → null (amostra insuficiente).
 * - Concordância perfeita → 1. Concordância no nível do acaso → ~0.
 * - po = proporção observada de concordância; pe = concordância esperada por acaso.
 * - Quando pe === 1 (todos no mesmo rótulo) retorna 1 (concordância perfeita degenerada).
 */
export function cohenKappa(pairs: KappaPair[]): number | null {
  if (!Array.isArray(pairs) || pairs.length < MIN_KAPPA_PAIRS) return null

  const n = pairs.length
  let a = 0 // human pass, judge pass
  let b = 0 // human pass, judge fail
  let c = 0 // human fail, judge pass
  let d = 0 // human fail, judge fail
  for (const p of pairs) {
    if (p.human && p.judge) a += 1
    else if (p.human && !p.judge) b += 1
    else if (!p.human && p.judge) c += 1
    else d += 1
  }

  const po = (a + d) / n

  const humanPass = (a + b) / n
  const humanFail = (c + d) / n
  const judgePass = (a + c) / n
  const judgeFail = (b + d) / n
  const pe = humanPass * judgePass + humanFail * judgeFail

  if (pe === 1) return 1 // sem variabilidade: concordância perfeita degenerada
  const kappa = (po - pe) / (1 - pe)
  // clamp por segurança numérica
  return Math.max(-1, Math.min(1, kappa))
}

/** Grupo de tag para segmentar a concordância (ex.: "reembolso"). */
export interface TagGroup {
  id: string
  label: string
  pairs: KappaPair[]
}

/**
 * Monta as linhas de kappa para a UI: "Concordância geral" + até 2 segmentos
 * de tag com mais pares. Segmentos com <10 pares são marcados como
 * insufficient (sem value). PURA, testada.
 */
export function buildKappaRows(pairs: KappaPair[], tagGroups: TagGroup[]): KappaRow[] {
  const rows: KappaRow[] = []

  const overall = cohenKappa(pairs)
  rows.push({
    id: 'overall',
    label: 'Concordância geral',
    ...(overall === null ? { insufficient: true } : { value: overall }),
  })

  // Top-2 segmentos por nº de pares (descendente).
  const sorted = [...(tagGroups ?? [])]
    .filter((g) => g && Array.isArray(g.pairs))
    .sort((x, y) => y.pairs.length - x.pairs.length)
    .slice(0, 2)

  for (const g of sorted) {
    const k = cohenKappa(g.pairs)
    rows.push({
      id: g.id,
      label: g.label,
      ...(k === null ? { insufficient: true } : { value: k }),
    })
  }

  return rows
}
