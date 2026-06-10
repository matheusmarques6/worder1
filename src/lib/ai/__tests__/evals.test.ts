// =============================================
// evals.test.ts — fns puras (Bloco F4)
//
// Sem chamadas LLM: cobre summarizeCriteria (maioria, texto de detalhe,
// contagem de falhas) e versionScores (média + null sem resultados).
// =============================================

import { describe, it, expect } from 'vitest'
import { summarizeCriteria, versionScores, type Version } from '../evals'

const criteria = [
  { id: 'c1', label: 'Responde no escopo', description: 'desc1' },
  { id: 'c2', label: 'Tom adequado', description: 'desc2' },
]

describe('summarizeCriteria', () => {
  it('sem resultados → pass=true e usa a descrição como detalhe', () => {
    const out = summarizeCriteria(criteria, [])
    expect(out[0].pass).toBe(true)
    expect(out[0].detail).toBe('desc1')
  })

  it('maioria passa → pass=true; conta as falhas no detalhe', () => {
    const results = [
      { criteria_results: [{ id: 'c1', pass: true }, { id: 'c2', pass: false }] },
      { criteria_results: [{ id: 'c1', pass: true }, { id: 'c2', pass: false }] },
      { criteria_results: [{ id: 'c1', pass: false }, { id: 'c2', pass: false }] },
    ]
    const out = summarizeCriteria(criteria, results)
    // c1: 2 pass / 1 fail → maioria pass
    expect(out[0].pass).toBe(true)
    expect(out[0].detail).toBe('Falhou em 1 de 3 casos.')
    // c2: 0 pass / 3 fail → fail
    expect(out[1].pass).toBe(false)
    expect(out[1].detail).toBe('Falhou em 3 de 3 casos.')
  })

  it('empate conta como maioria (pass)', () => {
    const results = [
      { criteria_results: [{ id: 'c1', pass: true }] },
      { criteria_results: [{ id: 'c1', pass: false }] },
    ]
    const out = summarizeCriteria(criteria, results)
    expect(out[0].pass).toBe(true)
    expect(out[0].detail).toBe('Falhou em 1 de 2 casos.')
  })

  it('todos passam → detalhe sem contagem de falhas', () => {
    const results = [
      { criteria_results: [{ id: 'c1', pass: true }] },
      { criteria_results: [{ id: 'c1', pass: true }] },
    ]
    const out = summarizeCriteria(criteria, results)
    expect(out[0].pass).toBe(true)
    expect(out[0].detail).not.toContain('Falhou')
  })
})

describe('versionScores', () => {
  const versions: Version[] = [
    { id: 'v2', tag: 'v2', label: 'B', score: null, date: 'd', current: true },
    { id: 'v1', tag: 'v1', label: 'A', score: null, date: 'd' },
  ]

  it('média arredondada por version_id', () => {
    const results = [
      { version_id: 'v2', score: 80 },
      { version_id: 'v2', score: 90 },
      { version_id: 'v1', score: 70 },
    ]
    const out = versionScores(versions, results)
    expect(out.find((v) => v.id === 'v2')!.score).toBe(85)
    expect(out.find((v) => v.id === 'v1')!.score).toBe(70)
  })

  it('null quando a versão não tem resultados', () => {
    const out = versionScores(versions, [{ version_id: 'v2', score: 60 }])
    expect(out.find((v) => v.id === 'v1')!.score).toBeNull()
  })

  it('ignora resultados sem version_id ou sem score', () => {
    const out = versionScores(versions, [
      { version_id: null, score: 99 },
      { version_id: 'v1', score: null },
    ])
    expect(out.find((v) => v.id === 'v1')!.score).toBeNull()
    expect(out.find((v) => v.id === 'v2')!.score).toBeNull()
  })
})
