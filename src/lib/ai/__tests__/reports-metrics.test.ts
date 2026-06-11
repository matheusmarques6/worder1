// =============================================
// reports-metrics.ts — pure helper unit tests (Bloco F5)
//
// Cobre o score de qualidade ponderado (com renormalização de pesos),
// o mapeamento score→estrelas, o histograma de distribuição e a janela
// de período. Sem LLM/DB/rede.
// =============================================

import { describe, it, expect } from 'vitest'
import {
  computeQualityScore,
  scoreToStars,
  buildDistribution,
  periodToRange,
  resolveCsat,
  MIN_REAL_CSAT_SAMPLE,
} from '../reports-metrics'

describe('computeQualityScore', () => {
  it('all three present → weighted average (0.5/0.3/0.2)', () => {
    // 0.5*80 + 0.3*(0.5*100) + 0.2*90 = 40 + 15 + 18 = 73
    expect(
      computeQualityScore({ judgeAvg: 80, annotationGoodRatio: 0.5, resolutionRate: 90 })
    ).toBe(73)
  })

  it('one missing → weights renormalized over the present two', () => {
    // judge 80 (w0.5) + resolution 90 (w0.2); total weight 0.7
    // (0.5*80 + 0.2*90)/0.7 = (40+18)/0.7 = 58/0.7 = 82.857 → 83
    expect(
      computeQualityScore({ judgeAvg: 80, annotationGoodRatio: null, resolutionRate: 90 })
    ).toBe(83)
  })

  it('two missing → single component dominates (weight renormalizes to 1)', () => {
    expect(
      computeQualityScore({ judgeAvg: 64, annotationGoodRatio: null, resolutionRate: null })
    ).toBe(64)
    expect(
      computeQualityScore({ judgeAvg: null, annotationGoodRatio: 0.4, resolutionRate: null })
    ).toBe(40)
    expect(
      computeQualityScore({ judgeAvg: null, annotationGoodRatio: null, resolutionRate: 77 })
    ).toBe(77)
  })

  it('all missing → 0', () => {
    expect(computeQualityScore({})).toBe(0)
    expect(
      computeQualityScore({ judgeAvg: null, annotationGoodRatio: null, resolutionRate: null })
    ).toBe(0)
  })

  it('never returns NaN, even with NaN inputs', () => {
    const r = computeQualityScore({ judgeAvg: NaN, annotationGoodRatio: NaN, resolutionRate: NaN })
    expect(Number.isNaN(r)).toBe(false)
    expect(r).toBe(0)
  })

  it('clamps out-of-range components', () => {
    // judge 200 → clamped to 100, alone → 100
    expect(computeQualityScore({ judgeAvg: 200 })).toBe(100)
    expect(computeQualityScore({ resolutionRate: -10 })).toBe(0)
  })
})

describe('scoreToStars', () => {
  it('maps boundaries on the linear scale (1 + score/100*4)', () => {
    expect(scoreToStars(0)).toBe(1)
    expect(scoreToStars(100)).toBe(5)
    expect(scoreToStars(50)).toBe(3)
    expect(scoreToStars(25)).toBe(2)
    expect(scoreToStars(75)).toBe(4)
  })

  it('keeps one decimal', () => {
    // 49 → 1 + 0.49*4 = 2.96 → 3.0
    expect(scoreToStars(49)).toBe(3)
    // 90 → 1 + 0.9*4 = 4.6
    expect(scoreToStars(90)).toBe(4.6)
  })

  it('clamps out-of-range scores', () => {
    expect(scoreToStars(-50)).toBe(1)
    expect(scoreToStars(500)).toBe(5)
  })

  it('NaN → 1 (never NaN)', () => {
    expect(scoreToStars(NaN)).toBe(1)
  })
})

describe('buildDistribution', () => {
  it('empty list → all zeros (5..1)', () => {
    expect(buildDistribution([])).toEqual([
      { stars: 5, pct: 0 },
      { stars: 4, pct: 0 },
      { stars: 3, pct: 0 },
      { stars: 2, pct: 0 },
      { stars: 1, pct: 0 },
    ])
  })

  it('single value → 100% in its bucket', () => {
    expect(buildDistribution([5])).toEqual([
      { stars: 5, pct: 100 },
      { stars: 4, pct: 0 },
      { stars: 3, pct: 0 },
      { stars: 2, pct: 0 },
      { stars: 1, pct: 0 },
    ])
  })

  it('rounds decimals to nearest star bucket', () => {
    // 4.6 → 5, 4.4 → 4
    const d = buildDistribution([4.6, 4.4])
    expect(d.find((x) => x.stars === 5)?.pct).toBe(50)
    expect(d.find((x) => x.stars === 4)?.pct).toBe(50)
  })

  it('always sums to 100 even with rounding (thirds)', () => {
    const d = buildDistribution([5, 4, 3])
    expect(d.reduce((s, x) => s + x.pct, 0)).toBe(100)
  })

  it('sums to 100 over a noisy list', () => {
    const list = [5, 5, 5, 4, 4, 3, 3, 2, 1, 1, 1]
    const d = buildDistribution(list)
    expect(d.reduce((s, x) => s + x.pct, 0)).toBe(100)
  })

  it('clamps stars outside 1..5 into the edge buckets', () => {
    const d = buildDistribution([0, 9])
    expect(d.find((x) => x.stars === 1)?.pct).toBe(50)
    expect(d.find((x) => x.stars === 5)?.pct).toBe(50)
  })
})

describe('periodToRange', () => {
  it('returns now minus N days for each period', () => {
    const now = Date.now()
    const off = (iso: string) => Math.round((now - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
    expect(off(periodToRange('7d').sinceISO)).toBe(7)
    expect(off(periodToRange('30d').sinceISO)).toBe(30)
    expect(off(periodToRange('90d').sinceISO)).toBe(90)
  })

  it('produces a valid ISO string', () => {
    const iso = periodToRange('30d').sinceISO
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false)
    expect(iso).toMatch(/Z$/)
  })
})

describe('resolveCsat', () => {
  it('>= MIN_REAL_CSAT_SAMPLE respostas reais → source real, média 1 decimal, distribuição das reais', () => {
    const r = resolveCsat([5, 5, 4, 4, 3], [scoreToStars(10)])
    expect(r.csat).toEqual({ value: 4.2, source: 'real', sampleSize: 5 })
    expect(r.starsForDistribution).toEqual([5, 5, 4, 4, 3])
  })

  it('abaixo do limiar → proxy estimado (média das estrelas do juiz)', () => {
    const r = resolveCsat([5], [4.0, 3.0])
    expect(r.csat).toEqual({ value: 3.5, source: 'estimated', sampleSize: 2 })
    expect(r.starsForDistribution).toEqual([4.0, 3.0])
  })

  it('sem nada → estimated com value 0 e sampleSize 0', () => {
    expect(resolveCsat([], []).csat).toEqual({ value: 0, source: 'estimated', sampleSize: 0 })
  })

  it('ignora ratings fora de 1..5', () => {
    const r = resolveCsat([5, 4, 0, 9, 5, 4, 3], [])
    expect(r.csat.sampleSize).toBe(5)
    expect(r.csat.source).toBe('real')
  })

  it('limiar é 5', () => expect(MIN_REAL_CSAT_SAMPLE).toBe(5))
})
