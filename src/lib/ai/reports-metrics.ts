// =============================================
// Métricas de relatórios (Bloco F5) — funções PURAS, sem I/O.
//
// Usadas por getReportSummary (proposals.ts) e testadas em unidade. Nenhuma
// chamada de rede/LLM/DB aqui — só transformação de números.
//
// DECISÃO DE PRODUTO (travada): NÃO existe captura real de CSAT do cliente. A
// satisfação é um PROXY ESTIMADO PELA IA — derivamos 1–5 estrelas das notas do
// juiz/anotações via scoreToStars e a UI rotula o tile como
// "Satisfação estimada (IA)". Estas funções NÃO inventam um CSAT real.
// =============================================

/**
 * Score de qualidade 0–100 = média ponderada de:
 *  - judgeAvg          (0–100)  peso 0.5
 *  - goodRatio·100     (0–100)  peso 0.3  (goodRatio é 0..1)
 *  - resolutionRate    (0–100)  peso 0.2
 *
 * Componentes AUSENTES (null/undefined/NaN) são EXCLUÍDOS e os pesos dos
 * presentes são RENORMALIZADOS (somam 1). Todos ausentes → 0. Arredonda para
 * inteiro. Nunca devolve NaN.
 */
export function computeQualityScore(parts: {
  judgeAvg?: number | null
  annotationGoodRatio?: number | null
  resolutionRate?: number | null
}): number {
  const components: Array<{ value: number; weight: number }> = []

  const judge = parts.judgeAvg
  if (typeof judge === 'number' && Number.isFinite(judge)) {
    components.push({ value: clamp(judge, 0, 100), weight: 0.5 })
  }
  const good = parts.annotationGoodRatio
  if (typeof good === 'number' && Number.isFinite(good)) {
    components.push({ value: clamp(good, 0, 1) * 100, weight: 0.3 })
  }
  const res = parts.resolutionRate
  if (typeof res === 'number' && Number.isFinite(res)) {
    components.push({ value: clamp(res, 0, 100), weight: 0.2 })
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  if (totalWeight <= 0) return 0

  const weighted = components.reduce((s, c) => s + c.value * c.weight, 0)
  const score = weighted / totalWeight
  return Math.round(clamp(score, 0, 100))
}

/**
 * Mapeia um score 0–100 para estrelas 1–5 (uma casa decimal — a UI mostra ex. 4.6).
 * Modelo linear: stars = 1 + (score/100)·4, com clamp em [1,5] e 1 decimal.
 * Bins de referência (limites do mapeamento linear):
 *   score 0   → 1.0★
 *   score 25  → 2.0★
 *   score 50  → 3.0★
 *   score 75  → 4.0★
 *   score 100 → 5.0★
 * Valores fora de [0,100] são clampeados antes do mapeamento.
 */
export function scoreToStars(score0to100: number): number {
  if (typeof score0to100 !== 'number' || Number.isNaN(score0to100)) return 1
  const s = clamp(score0to100, 0, 100)
  const stars = 1 + (s / 100) * 4
  return Math.round(clamp(stars, 1, 5) * 10) / 10
}

/**
 * Histograma de estrelas 5★..1★ a partir de uma lista de estrelas (1–5,
 * decimais arredondados para o inteiro mais próximo). Devolve pct por estrela
 * (inteiros) SOMANDO 100 — o resto do arredondamento é jogado no maior bucket.
 * Lista vazia → todas as estrelas com pct 0.
 */
export function buildDistribution(starsList: number[]): { stars: number; pct: number }[] {
  const buckets = [5, 4, 3, 2, 1]
  const counts = new Map<number, number>(buckets.map((b) => [b, 0]))

  let total = 0
  for (const raw of starsList) {
    if (typeof raw !== 'number' || Number.isNaN(raw)) continue
    const rounded = clamp(Math.round(raw), 1, 5)
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1)
    total += 1
  }

  if (total === 0) {
    return buckets.map((stars) => ({ stars, pct: 0 }))
  }

  // pct base (floor) + distribuição do resto para somar exatamente 100.
  const exact = buckets.map((stars) => ({ stars, raw: ((counts.get(stars) ?? 0) / total) * 100 }))
  const result = exact.map((e) => ({ stars: e.stars, pct: Math.floor(e.raw) }))
  let remainder = 100 - result.reduce((s, r) => s + r.pct, 0)

  // distribui o resto pelas maiores partes fracionárias
  const order = exact
    .map((e, i) => ({ i, frac: e.raw - Math.floor(e.raw) }))
    .sort((a, b) => b.frac - a.frac)
  let k = 0
  while (remainder > 0 && order.length > 0) {
    result[order[k % order.length].i].pct += 1
    remainder -= 1
    k += 1
  }

  return result
}

/** Janela do período: agora menos N dias. Devolve o ISO do início. */
export function periodToRange(period: '7d' | '30d' | '90d'): { sinceISO: string } {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return { sinceISO: since.toISOString() }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
