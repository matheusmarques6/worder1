// =============================================
// Experimentos de popup — a matemática, sem banco.
//
//   twoProportionZTest   — duas proporções (inscrições ÷ impressões), z e
//                          p bilateral, lift relativo e intervalo de 95%.
//   evaluateExperiment   — dado o KPI, a amostra mínima e a confiança, diz
//                          quem lidera, se já dá para declarar vencedor e
//                          por quê ainda não.
//   thompsonWeights      — pesos por variante a partir de Beta(1+k, 1+n−k),
//                          para o modo bandit (Prism-lite). Piso de
//                          exploração para nenhuma variante morrer cedo.
//   pickByWeight         — a mesma escolha determinística que o runtime
//                          faz com o hash do visitante.
//
// Regras que evitam auto-engano: teste só encerra com n ≥ mínimo em TODAS
// as variantes; p-valor é bilateral; o cron chama isto no máximo a cada
// 30 min (o "peeking" contínuo inflaria falsos positivos).
// =============================================

export type ExperimentKpi = 'submit' | 'optin' | 'revenue'

export interface VariantStats {
  variantId: string
  impressions: number
  visitors: number
  submissions: number
  optins: number
  orders: number
  revenue: number
}

export interface Comparison {
  variantId: string
  n: number
  k: number
  rate: number
  controlRate: number
  z: number | null
  p: number | null
  lift: number | null
  ci95: [number, number] | null
  significant: boolean
  enoughSample: boolean
  /** Receita por impressão, informativa (KPI 'revenue' testa a taxa de pedidos). */
  revenuePerImpression: number
}

export interface Evaluation {
  kpi: ExperimentKpi
  controlId: string
  comparisons: Comparison[]
  leaderId: string | null
  winnerId: string | null
  ready: boolean
  reason: 'no_data' | 'sample_too_small' | 'not_significant' | 'winner' | 'control_wins'
}

/** Função de distribuição acumulada da normal padrão (Abramowitz–Stegun 26.2.17). */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2)
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const p = 1 - d * poly
  return z >= 0 ? p : 1 - p
}

/** z crítico bilateral para a confiança pedida (0.90 → 1.645, 0.95 → 1.96, 0.99 → 2.576). */
export function zCritical(confidence: number): number {
  const c = Math.min(0.999, Math.max(0.5, confidence || 0.95))
  // Busca binária na CDF: rápida e sem tabela.
  let lo = 0, hi = 6
  const target = 1 - (1 - c) / 2
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (normalCdf(mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function twoProportionZTest(kControl: number, nControl: number, kVariant: number, nVariant: number): {
  z: number | null; p: number | null; lift: number | null; ci95: [number, number] | null
} {
  if (nControl <= 0 || nVariant <= 0) return { z: null, p: null, lift: null, ci95: null }
  const p1 = kControl / nControl
  const p2 = kVariant / nVariant
  const pooled = (kControl + kVariant) / (nControl + nVariant)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nControl + 1 / nVariant))
  const z = se > 0 ? (p2 - p1) / se : 0
  const p = se > 0 ? 2 * (1 - normalCdf(Math.abs(z))) : 1
  const seDiff = Math.sqrt((p1 * (1 - p1)) / nControl + (p2 * (1 - p2)) / nVariant)
  const diff = p2 - p1
  const ci95: [number, number] = [diff - 1.96 * seDiff, diff + 1.96 * seDiff]
  const lift = p1 > 0 ? diff / p1 : null
  return { z, p, lift, ci95 }
}

export function kpiCounts(s: VariantStats, kpi: ExperimentKpi): { n: number; k: number } {
  const n = Math.max(0, Number(s.impressions) || 0)
  const k = kpi === 'submit' ? s.submissions : kpi === 'optin' ? s.optins : s.orders
  return { n, k: Math.min(n, Math.max(0, Number(k) || 0)) }
}

export function evaluateExperiment(
  stats: VariantStats[],
  opts: { kpi: ExperimentKpi; controlId: string; minSample: number; confidence: number },
): Evaluation {
  const kpi = opts.kpi
  const zc = zCritical(opts.confidence)
  const control = stats.find((s) => s.variantId === opts.controlId) || { variantId: opts.controlId, impressions: 0, visitors: 0, submissions: 0, optins: 0, orders: 0, revenue: 0 }
  const cc = kpiCounts(control, kpi)
  const controlRate = cc.n > 0 ? cc.k / cc.n : 0
  const minSample = Math.max(1, opts.minSample || 1)

  const comparisons: Comparison[] = stats.map((s) => {
    const c = kpiCounts(s, kpi)
    const rate = c.n > 0 ? c.k / c.n : 0
    const isControl = s.variantId === opts.controlId
    const t = isControl ? { z: null, p: null, lift: null, ci95: null } : twoProportionZTest(cc.k, cc.n, c.k, c.n)
    return {
      variantId: s.variantId,
      n: c.n,
      k: c.k,
      rate,
      controlRate,
      z: t.z,
      p: t.p,
      lift: t.lift,
      ci95: t.ci95,
      significant: !isControl && t.z != null && Math.abs(t.z) >= zc,
      enoughSample: c.n >= minSample,
      revenuePerImpression: c.n > 0 ? (Number(s.revenue) || 0) / c.n : 0,
    }
  })

  if (!comparisons.length || comparisons.every((c) => c.n === 0)) {
    return { kpi, controlId: opts.controlId, comparisons, leaderId: null, winnerId: null, ready: false, reason: 'no_data' }
  }
  const leader = [...comparisons].sort((a, b) => b.rate - a.rate || b.n - a.n)[0]
  const allEnough = comparisons.every((c) => c.enoughSample)
  if (!allEnough) {
    return { kpi, controlId: opts.controlId, comparisons, leaderId: leader.variantId, winnerId: null, ready: false, reason: 'sample_too_small' }
  }
  // Vencedor: a melhor variante bate o controle com significância; ou o
  // controle é o líder e toda variante perde para ele com significância.
  if (leader.variantId !== opts.controlId && leader.significant && (leader.z || 0) > 0) {
    return { kpi, controlId: opts.controlId, comparisons, leaderId: leader.variantId, winnerId: leader.variantId, ready: true, reason: 'winner' }
  }
  const others = comparisons.filter((c) => c.variantId !== opts.controlId)
  if (leader.variantId === opts.controlId && others.length && others.every((c) => c.significant && (c.z || 0) < 0)) {
    return { kpi, controlId: opts.controlId, comparisons, leaderId: opts.controlId, winnerId: opts.controlId, ready: true, reason: 'control_wins' }
  }
  return { kpi, controlId: opts.controlId, comparisons, leaderId: leader.variantId, winnerId: null, ready: false, reason: 'not_significant' }
}

// ---- Bandit (Thompson sampling) ---------------------------------------------

/** Gerador determinístico (mulberry32) — o cron precisa de resultado reproduzível no teste. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomNormal(rng: () => number): number {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Gamma(shape ≥ 1) por Marsaglia–Tsang; shape < 1 pelo truque de boost. */
function randomGamma(shape: number, rng: () => number): number {
  if (shape < 1) return randomGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape)
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number, v: number
    do { x = randomNormal(rng); v = 1 + c * x } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

export function randomBeta(alpha: number, beta: number, rng: () => number): number {
  const x = randomGamma(alpha, rng)
  const y = randomGamma(beta, rng)
  return x / (x + y)
}

export interface Arm { id: string; successes: number; trials: number }

/**
 * Probabilidade de cada braço ser o melhor, estimada por amostragem. Piso
 * `floor` por braço (padrão 5%) garante exploração contínua; a soma é 1.
 */
export function thompsonWeights(arms: Arm[], opts: { samples?: number; floor?: number; rng?: () => number } = {}): Record<string, number> {
  const out: Record<string, number> = {}
  if (!arms.length) return out
  if (arms.length === 1) return { [arms[0].id]: 1 }
  const samples = Math.max(200, opts.samples || 2000)
  const floor = Math.min(0.5 / arms.length, Math.max(0, opts.floor ?? 0.05))
  const rng = opts.rng || Math.random
  const wins = arms.map(() => 0)
  for (let s = 0; s < samples; s++) {
    let best = -1, bestV = -1
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i]
      const k = Math.max(0, a.successes), n = Math.max(k, a.trials)
      const v = randomBeta(1 + k, 1 + (n - k), rng)
      if (v > bestV) { bestV = v; best = i }
    }
    wins[best]++
  }
  const raw = wins.map((w) => w / samples)
  // Piso garantido e soma 1: cada braço recebe o piso e o resto é
  // distribuído na proporção das vitórias.
  const rest = 1 - floor * arms.length
  const weighted = raw.map((w) => floor + rest * w)
  arms.forEach((a, i) => { out[a.id] = Math.round(weighted[i] * 10000) / 10000 })
  // Arredondamento: a diferença vai para o maior.
  const drift = Math.round((1 - Object.values(out).reduce((x, y) => x + y, 0)) * 10000) / 10000
  if (drift !== 0) { const top = arms[weighted.indexOf(Math.max(...weighted))].id; out[top] = Math.round((out[top] + drift) * 10000) / 10000 }
  return out
}

/** Escolha determinística por fração em [0,1): a mesma regra do runtime. */
export function pickByWeight(fraction: number, weights: Record<string, number>): string | null {
  const ids = Object.keys(weights)
  if (!ids.length) return null
  const total = ids.reduce((s, id) => s + Math.max(0, Number(weights[id]) || 0), 0)
  if (total <= 0) return ids[0]
  let acc = 0
  const f = Math.min(0.999999, Math.max(0, fraction)) * total
  for (const id of ids) {
    acc += Math.max(0, Number(weights[id]) || 0)
    if (f < acc) return id
  }
  return ids[ids.length - 1]
}

/** O hash do runtime (31·h + c, 32 bits) → fração em [0,1). Mantido igual ao gerado. */
export function hashFraction(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 10000) / 10000
}

/** Chave de contexto do bandit — a mesma que o runtime monta. */
export function contextKey(page: string | null | undefined, traffic: string | null | undefined, device: string | null | undefined): string {
  // O runtime só distingue celular de "não celular" (largura); tablet
  // entra como desktop para as chaves baterem dos dois lados.
  const dev = device === 'mobile' ? 'mobile' : 'desktop'
  return `${page || 'other'}|${traffic || 'direct'}|${dev}`
}

/**
 * Normaliza um split vindo do lojista: só ids conhecidos, pesos ≥ 0,
 * soma 100. Sem nada válido, divide igualmente.
 */
export function normalizeSplit(split: Record<string, unknown> | null | undefined, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  let total = 0
  for (const id of ids) {
    const v = Math.max(0, Number((split || {})[id]) || 0)
    out[id] = v
    total += v
  }
  if (total <= 0) {
    const each = Math.floor(100 / ids.length)
    ids.forEach((id, i) => { out[id] = i === 0 ? 100 - each * (ids.length - 1) : each })
    return out
  }
  let acc = 0
  ids.forEach((id, i) => {
    if (i === ids.length - 1) out[id] = Math.max(0, 100 - acc)
    else { out[id] = Math.round((out[id] / total) * 100); acc += out[id] }
  })
  return out
}
