// =============================================
// judge.test.ts — parseJudgeJson (Bloco F3)
//
// Sem chamadas LLM: cobre apenas a fn pura de parse defensivo do veredito.
// =============================================

import { describe, it, expect } from 'vitest'
import { parseJudgeJson } from '../judge'

describe('parseJudgeJson', () => {
  it('parseia JSON limpo', () => {
    const v = parseJudgeJson('{"score": 90, "note": "ok", "flags": []}')
    expect(v).not.toBeNull()
    expect(v!.score).toBe(90)
    expect(v!.note).toBe('ok')
    expect(v!.flags).toEqual([])
  })

  it('tira cercas ```json e parseia', () => {
    const raw = '```json\n{"score": 70, "note": "atenção", "flags": [{"turn_index": 1, "label": "tom"}]}\n```'
    const v = parseJudgeJson(raw)
    expect(v).not.toBeNull()
    expect(v!.score).toBe(70)
    expect(v!.flags).toHaveLength(1)
    expect(v!.flags[0]).toEqual({ turn_index: 1, label: 'tom' })
  })

  it('ignora prosa antes/depois do objeto JSON', () => {
    const raw = 'Aqui está a avaliação:\n{"score": 55, "note": "x", "flags": []}\nFim.'
    const v = parseJudgeJson(raw)
    expect(v).not.toBeNull()
    expect(v!.score).toBe(55)
  })

  it('retorna null em lixo (sem JSON)', () => {
    expect(parseJudgeJson('isto não é json')).toBeNull()
    expect(parseJudgeJson('')).toBeNull()
    expect(parseJudgeJson('   ')).toBeNull()
  })

  it('retorna null quando não há objeto balanceado', () => {
    expect(parseJudgeJson('{ score: 50')).toBeNull()
  })

  it('clampa score acima de 100 e abaixo de 0, arredondando', () => {
    expect(parseJudgeJson('{"score": 150}')!.score).toBe(100)
    expect(parseJudgeJson('{"score": -20}')!.score).toBe(0)
    expect(parseJudgeJson('{"score": 84.6}')!.score).toBe(85)
  })

  it('retorna null quando score não é número', () => {
    expect(parseJudgeJson('{"score": "alto", "flags": []}')).toBeNull()
    expect(parseJudgeJson('{"note": "sem score"}')).toBeNull()
    expect(parseJudgeJson('{"score": null}')).toBeNull()
  })

  it('flags ausente vira []', () => {
    const v = parseJudgeJson('{"score": 80}')
    expect(v).not.toBeNull()
    expect(v!.flags).toEqual([])
  })

  it('flags inválido (não-array) vira []', () => {
    const v = parseJudgeJson('{"score": 80, "flags": "oops"}')
    expect(v!.flags).toEqual([])
  })

  it('descarta flags malformadas e preserva severe', () => {
    const raw = JSON.stringify({
      score: 40,
      note: 'grave',
      flags: [
        { turn_index: 0, label: 'conselho', severe: true },
        { turn_index: 'x', label: 'inválida' }, // turn_index não-numérico
        { label: 'sem index' }, // sem turn_index
        { turn_index: 2 }, // sem label
        { turn_index: 3, label: 'ok' },
      ],
    })
    const v = parseJudgeJson(raw)
    expect(v!.flags).toHaveLength(2)
    expect(v!.flags[0]).toEqual({ turn_index: 0, label: 'conselho', severe: true })
    expect(v!.flags[1]).toEqual({ turn_index: 3, label: 'ok' })
    // severe nunca é setado como false explicitamente
    expect(v!.flags[1]).not.toHaveProperty('severe')
  })

  it('note ausente vira string vazia', () => {
    const v = parseJudgeJson('{"score": 80, "flags": []}')
    expect(v!.note).toBe('')
  })
})
