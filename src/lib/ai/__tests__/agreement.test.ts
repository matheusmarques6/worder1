// =============================================
// agreement.test.ts — fns puras (Bloco F4)
//
// Sem chamadas LLM: cobre cohenKappa (perfeito, acaso, matriz textbook, <10) e
// buildKappaRows (segmentação top-2 + dados insuficientes).
// =============================================

import { describe, it, expect } from 'vitest'
import {
  cohenKappa,
  buildKappaRows,
  MIN_KAPPA_PAIRS,
  type KappaPair,
  type TagGroup,
} from '../agreement'

/** Helper: n pares com human=judge=val. */
function agree(n: number, val: boolean): KappaPair[] {
  return Array.from({ length: n }, () => ({ human: val, judge: val }))
}

describe('cohenKappa', () => {
  it('null quando há menos de 10 pares', () => {
    expect(cohenKappa(agree(9, true))).toBeNull()
    expect(cohenKappa([])).toBeNull()
  })

  it('concordância perfeita com variabilidade → 1', () => {
    const pairs: KappaPair[] = [
      ...agree(6, true),
      ...agree(6, false),
    ]
    expect(cohenKappa(pairs)).toBe(1)
  })

  it('concordância perfeita degenerada (todos iguais) → 1', () => {
    expect(cohenKappa(agree(12, true))).toBe(1)
  })

  it('nível do acaso → ~0', () => {
    // 50/50 nos dois eixos, sem correlação: a=b=c=d
    const pairs: KappaPair[] = [
      ...Array.from({ length: 5 }, () => ({ human: true, judge: true })),
      ...Array.from({ length: 5 }, () => ({ human: true, judge: false })),
      ...Array.from({ length: 5 }, () => ({ human: false, judge: true })),
      ...Array.from({ length: 5 }, () => ({ human: false, judge: false })),
    ]
    const k = cohenKappa(pairs)
    expect(k).not.toBeNull()
    expect(Math.abs(k as number)).toBeLessThan(0.001)
  })

  it('matriz textbook: kappa ≈ 0.4 (Cohen 1960)', () => {
    // Tabela clássica: a=20, b=5, c=10, d=15 (n=50)
    // po = 35/50 = 0.7; pe = (25/50)(30/50) + (25/50)(20/50) = 0.30+0.20 = 0.50
    // kappa = (0.7-0.5)/(1-0.5) = 0.4
    const pairs: KappaPair[] = [
      ...Array.from({ length: 20 }, () => ({ human: true, judge: true })),
      ...Array.from({ length: 5 }, () => ({ human: true, judge: false })),
      ...Array.from({ length: 10 }, () => ({ human: false, judge: true })),
      ...Array.from({ length: 15 }, () => ({ human: false, judge: false })),
    ]
    const k = cohenKappa(pairs)
    expect(k).toBeCloseTo(0.4, 5)
  })
})

describe('buildKappaRows', () => {
  it('inclui sempre a linha geral; insuficiente quando <10 pares', () => {
    const rows = buildKappaRows(agree(5, true), [])
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('overall')
    expect(rows[0].insufficient).toBe(true)
    expect(rows[0].value).toBeUndefined()
  })

  it('linha geral com value quando há dados suficientes', () => {
    const rows = buildKappaRows(agree(MIN_KAPPA_PAIRS, true), [])
    expect(rows[0].value).toBe(1)
    expect(rows[0].insufficient).toBeUndefined()
  })

  it('segmenta nos 2 maiores grupos de tag e marca insuficiência', () => {
    const big: TagGroup = { id: 'a', label: 'reembolso', pairs: agree(12, true) }
    const mid: TagGroup = { id: 'b', label: 'preço', pairs: agree(11, false) }
    const small: TagGroup = { id: 'c', label: 'estoque', pairs: agree(3, true) }
    const rows = buildKappaRows(agree(MIN_KAPPA_PAIRS, true), [small, big, mid])
    // overall + top-2 (big, mid) — small (3 pares) fica de fora
    expect(rows.map((r) => r.id)).toEqual(['overall', 'a', 'b'])
    expect(rows[1].value).toBe(1)
    expect(rows[2].value).toBe(1)
  })

  it('segmento com <10 pares vira insuficiente', () => {
    const seg: TagGroup = { id: 'a', label: 'raro', pairs: agree(4, true) }
    const rows = buildKappaRows(agree(MIN_KAPPA_PAIRS, true), [seg])
    expect(rows[1].insufficient).toBe(true)
    expect(rows[1].value).toBeUndefined()
  })
})
