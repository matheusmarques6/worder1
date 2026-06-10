// =============================================
// test-runner.test.ts — fns puras (Bloco F3)
//
// Sem chamadas LLM: cobre deriveRunStatus (matriz de fronteiras × flags) e
// buildScenarioSummary (arredondamento da média, contagens, lista vazia).
// =============================================

import { describe, it, expect } from 'vitest'
import {
  deriveRunStatus,
  buildScenarioSummary,
  type ScenarioResult,
} from '../test-runner'
import type { JudgeFlag } from '../judge'

const noFlags: JudgeFlag[] = []
const oneFlag: JudgeFlag[] = [{ turn_index: 1, label: 'tom' }]
const severeFlag: JudgeFlag[] = [{ turn_index: 0, label: 'conselho', severe: true }]

describe('deriveRunStatus', () => {
  it('grave quando score < 50', () => {
    expect(deriveRunStatus(49, noFlags)).toBe('grave')
    expect(deriveRunStatus(0, noFlags)).toBe('grave')
  })

  it('grave quando há flag severa, mesmo com score alto', () => {
    expect(deriveRunStatus(95, severeFlag)).toBe('grave')
  })

  it('flag na faixa 50–84 sem flag severa', () => {
    expect(deriveRunStatus(50, noFlags)).toBe('flag')
    expect(deriveRunStatus(84, noFlags)).toBe('flag')
  })

  it('flag quando há flag não-severa, mesmo com score >= 85', () => {
    expect(deriveRunStatus(90, oneFlag)).toBe('flag')
    expect(deriveRunStatus(100, oneFlag)).toBe('flag')
  })

  it('pass quando score >= 85 e sem flags', () => {
    expect(deriveRunStatus(85, noFlags)).toBe('pass')
    expect(deriveRunStatus(100, noFlags)).toBe('pass')
  })

  it('fronteiras: 49=grave, 50=flag, 84=flag, 85=pass', () => {
    expect(deriveRunStatus(49, noFlags)).toBe('grave')
    expect(deriveRunStatus(50, noFlags)).toBe('flag')
    expect(deriveRunStatus(84, noFlags)).toBe('flag')
    expect(deriveRunStatus(85, noFlags)).toBe('pass')
  })
})

function scn(partial: Partial<ScenarioResult>): ScenarioResult {
  return {
    id: partial.id ?? 's',
    title: partial.title ?? 't',
    persona: partial.persona ?? 'p',
    score: partial.score ?? null,
    status: partial.status ?? null,
    transcript: partial.transcript ?? [],
    ...(partial.note ? { note: partial.note } : {}),
  }
}

describe('buildScenarioSummary', () => {
  it('lista vazia → zeros', () => {
    expect(buildScenarioSummary([])).toEqual({ avg: 0, passed: 0, flagged: 0 })
  })

  it('média arredondada das notas; passed/flagged por status', () => {
    const list = [
      scn({ score: 96, status: 'pass' }),
      scn({ score: 71, status: 'flag' }),
      scn({ score: 38, status: 'grave' }),
    ]
    const s = buildScenarioSummary(list)
    expect(s.avg).toBe(68) // (96+71+38)/3 = 68.33 → 68
    expect(s.passed).toBe(1)
    expect(s.flagged).toBe(2)
  })

  it('arredondamento half-up', () => {
    const list = [scn({ score: 80, status: 'flag' }), scn({ score: 85, status: 'pass' })]
    expect(buildScenarioSummary(list).avg).toBe(83) // 82.5 → 83
  })

  it('ignora cenários não executados no cálculo da média', () => {
    const list = [
      scn({ score: 90, status: 'pass' }),
      scn({ score: null, status: null }), // não executado
    ]
    const s = buildScenarioSummary(list)
    expect(s.avg).toBe(90)
    expect(s.passed).toBe(1)
    expect(s.flagged).toBe(1) // não executado conta como "não-pass"
  })

  it('avg 0 quando nenhum cenário tem nota', () => {
    const list = [scn({ score: null, status: null }), scn({ score: null, status: null })]
    expect(buildScenarioSummary(list).avg).toBe(0)
  })
})
