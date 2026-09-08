import { describe, it, expect } from 'vitest'
import {
  normalCdf,
  zCritical,
  twoProportionZTest,
  evaluateExperiment,
  thompsonWeights,
  seededRandom,
  pickByWeight,
  hashFraction,
  normalizeSplit,
  type VariantStats,
} from '../experiments'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function v(variantId: string, impressions: number, submissions: number, extra: Partial<VariantStats> = {}): VariantStats {
  return { variantId, impressions, visitors: impressions, submissions, optins: submissions, orders: 0, revenue: 0, ...extra }
}

describe('normal e z crítico', () => {
  it('bate com a tabela', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3)
    expect(zCritical(0.95)).toBeCloseTo(1.96, 2)
    expect(zCritical(0.99)).toBeCloseTo(2.576, 2)
    expect(zCritical(0.9)).toBeCloseTo(1.645, 2)
  })
})

describe('teste z de duas proporções', () => {
  it('diferença clara com amostra grande é significativa; igual não é', () => {
    const t = twoProportionZTest(200, 10000, 260, 10000)
    expect(t.z!).toBeGreaterThan(1.96)
    expect(t.p!).toBeLessThan(0.05)
    expect(t.lift!).toBeCloseTo(0.3, 6)
    expect(t.ci95![0]).toBeGreaterThan(0)
    const same = twoProportionZTest(200, 10000, 200, 10000)
    expect(same.z).toBe(0)
    expect(same.p!).toBeCloseTo(1, 6)
  })

  it('sem impressões não há teste', () => {
    expect(twoProportionZTest(0, 0, 5, 100)).toEqual({ z: null, p: null, lift: null, ci95: null })
  })
})

describe('avaliação do experimento', () => {
  const opts = { kpi: 'submit' as const, controlId: A, minSample: 200, confidence: 0.95 }

  it('sem dados → no_data; amostra pequena → espera mesmo com diferença enorme', () => {
    expect(evaluateExperiment([], opts).reason).toBe('no_data')
    const r = evaluateExperiment([v(A, 50, 1), v(B, 50, 20)], opts)
    expect(r.reason).toBe('sample_too_small')
    expect(r.winnerId).toBeNull()
    expect(r.leaderId).toBe(B)
  })

  it('variante bate o controle com significância → vencedora', () => {
    const r = evaluateExperiment([v(A, 5000, 100), v(B, 5000, 150)], opts)
    expect(r.reason).toBe('winner')
    expect(r.winnerId).toBe(B)
    const cb = r.comparisons.find((c) => c.variantId === B)!
    expect(cb.significant).toBe(true)
    expect(cb.lift).toBeCloseTo(0.5, 6)
  })

  it('controle lidera e toda variante perde com significância → control_wins; diferença pequena → not_significant', () => {
    const win = evaluateExperiment([v(A, 5000, 150), v(B, 5000, 100), v(C, 5000, 95)], opts)
    expect(win.reason).toBe('control_wins')
    expect(win.winnerId).toBe(A)
    const ns = evaluateExperiment([v(A, 5000, 100), v(B, 5000, 105)], opts)
    expect(ns.reason).toBe('not_significant')
    expect(ns.winnerId).toBeNull()
  })

  it('KPI de receita testa a taxa de pedidos e informa receita por impressão', () => {
    const r = evaluateExperiment(
      [v(A, 5000, 300, { orders: 40, revenue: 4000 }), v(B, 5000, 300, { orders: 80, revenue: 9600 })],
      { ...opts, kpi: 'revenue' },
    )
    expect(r.winnerId).toBe(B)
    expect(r.comparisons.find((c) => c.variantId === B)!.revenuePerImpression).toBeCloseTo(1.92, 6)
  })

  it('opt-in nunca passa de impressões (k ≤ n)', () => {
    const r = evaluateExperiment([v(A, 10, 10, { optins: 50 })], { ...opts, kpi: 'optin', minSample: 1 })
    expect(r.comparisons[0].k).toBe(10)
  })
})

describe('bandit (Thompson)', () => {
  it('dá mais peso ao braço melhor, mantém o piso e soma 1', () => {
    const rng = seededRandom(42)
    const w = thompsonWeights(
      [{ id: A, successes: 100, trials: 5000 }, { id: B, successes: 180, trials: 5000 }, { id: C, successes: 90, trials: 5000 }],
      { rng, samples: 3000 },
    )
    expect(w[B]).toBeGreaterThan(0.8)
    expect(w[A]).toBeGreaterThanOrEqual(0.05)
    expect(w[C]).toBeGreaterThanOrEqual(0.05)
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3)
  })

  it('sem dados divide de forma equilibrada; um braço só leva tudo', () => {
    const w = thompsonWeights([{ id: A, successes: 0, trials: 0 }, { id: B, successes: 0, trials: 0 }], { rng: seededRandom(1) })
    expect(Math.abs(w[A] - w[B])).toBeLessThan(0.1)
    expect(thompsonWeights([{ id: A, successes: 3, trials: 10 }])).toEqual({ [A]: 1 })
  })

  it('é reproduzível com a mesma semente', () => {
    const arms = [{ id: A, successes: 10, trials: 100 }, { id: B, successes: 12, trials: 100 }]
    expect(thompsonWeights(arms, { rng: seededRandom(7) })).toEqual(thompsonWeights(arms, { rng: seededRandom(7) }))
  })
})

describe('escolha determinística e split', () => {
  it('pickByWeight respeita as faixas', () => {
    const w = { [A]: 70, [B]: 30 }
    expect(pickByWeight(0, w)).toBe(A)
    expect(pickByWeight(0.69, w)).toBe(A)
    expect(pickByWeight(0.7, w)).toBe(B)
    expect(pickByWeight(0.999, w)).toBe(B)
    expect(pickByWeight(0.5, {})).toBeNull()
    expect(pickByWeight(0.5, { [A]: 0, [B]: 0 })).toBe(A)
  })

  it('hashFraction é estável e fica em [0,1)', () => {
    const f = hashFraction('visitor-abc|exp-1')
    expect(f).toBe(hashFraction('visitor-abc|exp-1'))
    expect(f).toBeGreaterThanOrEqual(0)
    expect(f).toBeLessThan(1)
  })

  it('normalizeSplit soma 100 e ignora ids desconhecidos', () => {
    expect(normalizeSplit({ [A]: 1, [B]: 1, x: 50 }, [A, B])).toEqual({ [A]: 50, [B]: 50 })
    expect(normalizeSplit(null, [A, B, C])).toEqual({ [A]: 34, [B]: 33, [C]: 33 })
    expect(normalizeSplit({ [A]: 0, [B]: 100 }, [A, B])).toEqual({ [A]: 0, [B]: 100 })
    expect(normalizeSplit({ [A]: 2, [B]: 1 }, [A, B])).toEqual({ [A]: 67, [B]: 33 })
  })
})
