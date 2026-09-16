// =============================================
// evals.test.ts — fns puras (Bloco F4)
//
// Sem chamadas LLM: cobre summarizeCriteria (maioria, texto de detalhe,
// contagem de falhas) e versionScores (média + null sem resultados).
// =============================================

import { beforeEach, describe, it, expect, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkAiBudget: vi.fn(),
  judgeCase: vi.fn(),
  resolveJudgeKey: vi.fn(),
  trackAiUsage: vi.fn(),
}))

vi.mock('@/lib/ai/budget', () => ({
  checkAiBudget: (...args: unknown[]) => mocks.checkAiBudget(...args),
}))
vi.mock('@/lib/ai/judge', () => ({
  JUDGE_MODELS: { openai: 'judge-model' },
  judgeCase: (...args: unknown[]) => mocks.judgeCase(...args),
}))
vi.mock('@/lib/ai/judge-key', () => ({
  resolveJudgeKey: (...args: unknown[]) => mocks.resolveJudgeKey(...args),
}))
vi.mock('@/lib/ai/cost-tracker', () => ({
  trackAiUsage: (...args: unknown[]) => mocks.trackAiUsage(...args),
}))

import {
  listEval,
  runEvaluation,
  summarizeCriteria,
  syncCases,
  versionScores,
  type Version,
} from '../evals'

function fakeSupabase(
  seed: Record<string, Array<Record<string, any>>>,
  errors: Record<string, Error> = {}
) {
  const tables = new Map(Object.entries(seed).map(([name, rows]) => [name, [...rows]]))

  class Query implements PromiseLike<any> {
    private filters: Array<(row: Record<string, any>) => boolean> = []
    private max: number | null = null
    private selected = ''
    private ordering: { field: string; ascending: boolean } | null = null

    constructor(private table: string) {}

    private value(row: Record<string, any>, field: string) {
      return field.split('.').reduce<any>((value, key) => value?.[key], row)
    }
    select(fields = '') {
      this.selected = fields
      return this
    }
    eq(field: string, value: unknown) {
      this.filters.push((row) => this.value(row, field) === value)
      return this
    }
    in(field: string, values: unknown[]) {
      this.filters.push((row) => values.includes(this.value(row, field)))
      return this
    }
    order(field: string, options?: { ascending?: boolean }) {
      this.ordering = { field, ascending: options?.ascending ?? true }
      return this
    }
    limit(value: number) {
      this.max = value
      return this
    }
    insert(rows: Record<string, any> | Array<Record<string, any>>) {
      const next = Array.isArray(rows) ? rows : [rows]
      tables.set(this.table, [...(tables.get(this.table) ?? []), ...next])
      return Promise.resolve({ data: null, error: null })
    }
    upsert(rows: Record<string, any> | Array<Record<string, any>>) {
      const next = Array.isArray(rows) ? rows : [rows]
      tables.set(this.table, [...(tables.get(this.table) ?? []), ...next])
      return Promise.resolve({ data: null, error: null })
    }
    async maybeSingle() {
      const result = this.result()
      return { ...result, data: result.data?.[0] ?? null }
    }
    single() {
      return this.maybeSingle()
    }
    private result() {
      let rows = tables.get(this.table) ?? []
      if (
        this.table === 'agent_trace_annotations' &&
        this.selected.includes('agent_traces!inner')
      ) {
        const traces = tables.get('agent_traces') ?? []
        rows = rows.flatMap((annotation) => {
          const trace = traces.find((item) => item.id === annotation.trace_id)
          return trace ? [{ ...annotation, trace }] : []
        })
      }
      rows = rows.filter((row) =>
        this.filters.every((filter) => filter(row))
      )
      if (errors[this.table]) {
        return { data: null, error: errors[this.table], count: null }
      }
      if (this.ordering) {
        const { field, ascending } = this.ordering
        rows = [...rows].sort((a, b) =>
          String(a[field]).localeCompare(String(b[field])) * (ascending ? 1 : -1)
        )
      }
      rows = rows.slice(0, this.max ?? 1000)
      return { data: rows, error: null, count: rows.length }
    }
    then<TResult1 = any, TResult2 = never>(
      onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(this.result()).then(onfulfilled, onrejected)
    }
  }

  return {
    client: {
      from: (table: string) => new Query(table),
      rpc: async (name: string, params: Record<string, any>) => {
        if (errors[name]) return { data: null, error: errors[name] }
        if (name !== 'list_eligible_eval_cases') {
          throw new Error('Unexpected RPC: ' + name)
        }
        const traces = tables.get('agent_traces') ?? []
        const rows = (tables.get('ai_eval_cases') ?? [])
          .filter((evalCase) => {
            if (
              evalCase.agent_id !== params.p_agent_id ||
              evalCase.organization_id !== params.p_organization_id
            ) return false
            if (evalCase.source === 'scenario') return true
            if (evalCase.source !== 'annotation') return false
            return traces.some((trace) =>
              trace.id === evalCase.source_id &&
              trace.agent_id === params.p_agent_id &&
              trace.organization_id === params.p_organization_id &&
              trace.trace_source === 'runtime_accepted'
            )
          })
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, Math.min(params.p_limit ?? 20, 20))
        return { data: rows, error: null }
      },
    } as any,
    rows: (table: string) => tables.get(table) ?? [],
  }
}

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

describe('accepted trace consumers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkAiBudget.mockResolvedValue(undefined)
    mocks.resolveJudgeKey.mockResolvedValue({ provider: 'openai', apiKey: 'test-key' })
    mocks.judgeCase.mockResolvedValue({
      score: 90,
      verdict: 'pass',
      criteria: [{ id: 'criterion-1', pass: true }],
      usage: {},
    })
    mocks.trackAiUsage.mockResolvedValue(undefined)
  })

  it('materializes eval cases only from annotations on runtime_accepted traces', async () => {
    const db = fakeSupabase({
      agent_trace_annotations: [
        { trace_id: 'trace-accepted', agent_id: 'agent-1', organization_id: 'org-1', rating: 'good' },
        { trace_id: 'trace-legacy', agent_id: 'agent-1', organization_id: 'org-1', rating: 'fix', correction_text: 'legacy fix' },
      ],
      agent_traces: [
        { id: 'trace-accepted', agent_id: 'agent-1', organization_id: 'org-1', trace_source: 'runtime_accepted', input: 'accepted input' },
        { id: 'trace-legacy', agent_id: 'agent-1', organization_id: 'org-1', trace_source: 'legacy_generated', input: 'legacy input' },
      ],
      ai_test_scenarios: [],
      ai_eval_cases: [],
    })

    await syncCases(db.client, 'agent-1', 'org-1')

    expect(db.rows('ai_eval_cases').map((row) => row.source_id)).toEqual(['trace-accepted'])
  })

  it('materializes an older accepted annotation after 1001 legacy annotations', async () => {
    const legacyAnnotations = Array.from({ length: 1001 }, (_, index) => ({
      trace_id: 'trace-legacy-' + index,
      agent_id: 'agent-1',
      organization_id: 'org-1',
      rating: 'bad',
    }))
    const db = fakeSupabase({
      agent_trace_annotations: [
        ...legacyAnnotations,
        {
          trace_id: 'trace-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          rating: 'fix',
          correction_text: 'accepted correction',
        },
      ],
      agent_traces: [
        ...legacyAnnotations.map((annotation) => ({
          id: annotation.trace_id,
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'legacy_generated',
          input: 'legacy input',
        })),
        {
          id: 'trace-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'runtime_accepted',
          input: 'accepted input',
        },
      ],
      ai_test_scenarios: [],
      ai_eval_cases: [],
    })

    await syncCases(db.client, 'agent-1', 'org-1')

    expect(db.rows('ai_eval_cases')).toEqual([
      expect.objectContaining({
        source_id: 'trace-accepted',
        expected: 'accepted correction',
      }),
    ])
  })

  it('returns accepted and legacy trace history separately, scoped and capped at 20 each', async () => {
    const accepted = Array.from({ length: 25 }, (_, index) => ({
      id: `accepted-${index}`,
      agent_id: 'agent-1',
      organization_id: 'org-1',
      trace_source: 'runtime_accepted',
      created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }))
    const legacy = Array.from({ length: 23 }, (_, index) => ({
      id: `legacy-${index}`,
      agent_id: 'agent-1',
      organization_id: 'org-1',
      trace_source: 'legacy_generated',
      created_at: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }))
    const db = fakeSupabase({
      ai_eval_criteria: [],
      ai_eval_cases: [],
      ai_eval_results: [],
      ai_agent_versions: [],
      agent_traces: [
        ...accepted,
        ...legacy,
        {
          id: 'foreign-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-foreign',
          trace_source: 'runtime_accepted',
          created_at: '2099-01-01T00:00:00.000Z',
        },
      ],
    })

    const payload = await listEval(db.client, 'agent-1', 'org-1')

    expect(payload.acceptedTraces).toHaveLength(20)
    expect(payload.acceptedTraces.every((trace) => trace.id.startsWith('accepted-'))).toBe(true)
    expect(payload.legacyTraces).toHaveLength(20)
    expect(payload.legacyTraces.every((trace) => trace.id.startsWith('legacy-'))).toBe(true)
  })

  it('does not judge or persist a result for a preexisting legacy annotation case', async () => {
    const db = fakeSupabase({
      ai_eval_criteria: [{
        id: 'criterion-1',
        agent_id: 'agent-1',
        organization_id: 'org-1',
        label: 'Precisão',
        description: 'Resposta precisa',
        position: 0,
        is_active: true,
      }],
      agent_trace_annotations: [],
      ai_test_scenarios: [],
      ai_eval_cases: [{
        id: 'case-legacy',
        agent_id: 'agent-1',
        organization_id: 'org-1',
        title: 'Caso legado',
        input: 'legacy input',
        expected: '',
        source: 'annotation',
        source_id: 'trace-legacy',
        tags: [],
        created_at: '2026-09-15T00:00:00Z',
      }],
      agent_traces: [{
        id: 'trace-legacy',
        agent_id: 'agent-1',
        organization_id: 'org-1',
        trace_source: 'legacy_generated',
        output: 'legacy output',
      }],
      ai_agent_versions: [],
      ai_eval_results: [],
    })

    await runEvaluation(
      db.client,
      { id: 'agent-1', provider: 'openai' } as any,
      'org-1',
      'user-1'
    )

    expect(mocks.judgeCase).not.toHaveBeenCalled()
    expect(db.rows('ai_eval_results')).toEqual([])
  })

  it('still judges an eligible scenario after 1001 newer legacy annotation cases', async () => {
    const legacyCases = Array.from({ length: 1001 }, (_, index) => ({
      id: `case-legacy-${index}`,
      agent_id: 'agent-1',
      organization_id: 'org-1',
      title: `Caso legado ${index}`,
      input: `legacy input ${index}`,
      expected: '',
      source: 'annotation',
      source_id: `trace-legacy-${index}`,
      tags: [],
      created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    const db = fakeSupabase({
      ai_eval_criteria: [{
        id: 'criterion-1',
        agent_id: 'agent-1',
        organization_id: 'org-1',
        label: 'Precisão',
        description: 'Resposta precisa',
        position: 0,
        is_active: true,
      }],
      agent_trace_annotations: [],
      ai_test_scenarios: [],
      ai_eval_cases: [
        ...legacyCases,
        {
          id: 'case-scenario',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          title: 'Cenário válido',
          input: 'scenario input',
          expected: '',
          source: 'scenario',
          source_id: 'scenario-1',
          tags: [],
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
      agent_traces: legacyCases.map((evalCase) => ({
        id: evalCase.source_id,
        agent_id: 'agent-1',
        organization_id: 'org-1',
        trace_source: 'legacy_generated',
        output: 'legacy output',
      })),
      ai_scenario_runs: [{
        scenario_id: 'scenario-1',
        agent_id: 'agent-1',
        organization_id: 'org-1',
        transcript: [{ role: 'me', text: 'scenario output' }],
        created_at: '2026-09-15T00:00:00Z',
      }],
      ai_agent_versions: [],
      ai_eval_results: [],
    })

    await runEvaluation(
      db.client,
      { id: 'agent-1', provider: 'openai' } as any,
      'org-1',
      'user-1'
    )

    expect(mocks.judgeCase).toHaveBeenCalledTimes(1)
    expect(db.rows('ai_eval_results')).toEqual([
      expect.objectContaining({ case_id: 'case-scenario' }),
    ])
  })

  it('propagates an eligible cases RPC failure', async () => {
    const db = fakeSupabase(
      {
        ai_eval_criteria: [{
          id: 'criterion-1',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          label: 'Precisão',
          position: 0,
          is_active: true,
        }],
        agent_trace_annotations: [],
        ai_test_scenarios: [],
        ai_eval_cases: [],
      },
      { list_eligible_eval_cases: new Error('eligible cases unavailable') }
    )

    await expect(runEvaluation(
      db.client,
      { id: 'agent-1', provider: 'openai' } as any,
      'org-1',
      'user-1'
    )).rejects.toThrow('eligible cases unavailable')
    expect(mocks.judgeCase).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'manual', source: 'manual' },
    { label: 'null', source: null },
  ])('excludes 20 newer $label cases before capping and still judges a scenario', async ({ source }) => {
    const ineligibleCases = Array.from({ length: 20 }, (_, index) => ({
      id: `case-ineligible-${index}`,
      agent_id: 'agent-1',
      organization_id: 'org-1',
      title: `Caso inelegível ${index}`,
      input: `ineligible input ${index}`,
      expected: '',
      source,
      source_id: `ineligible-source-${index}`,
      tags: [],
      created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    const db = fakeSupabase({
      ai_eval_criteria: [{
        id: 'criterion-1',
        agent_id: 'agent-1',
        organization_id: 'org-1',
        label: 'Precisão',
        description: 'Resposta precisa',
        position: 0,
        is_active: true,
      }],
      agent_trace_annotations: [],
      ai_test_scenarios: [],
      ai_eval_cases: [
        ...ineligibleCases,
        {
          id: 'case-scenario',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          title: 'Cenário válido',
          input: 'scenario input',
          expected: '',
          source: 'scenario',
          source_id: 'scenario-1',
          tags: [],
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
      agent_traces: [],
      ai_scenario_runs: [{
        scenario_id: 'scenario-1',
        agent_id: 'agent-1',
        organization_id: 'org-1',
        transcript: [{ role: 'me', text: 'scenario output' }],
        created_at: '2026-09-15T00:00:00Z',
      }],
      ai_agent_versions: [],
      ai_eval_results: [],
    })

    await runEvaluation(
      db.client,
      { id: 'agent-1', provider: 'openai' } as any,
      'org-1',
      'user-1'
    )

    expect(mocks.judgeCase).toHaveBeenCalledTimes(1)
    expect(db.rows('ai_eval_results')).toEqual([
      expect.objectContaining({ case_id: 'case-scenario' }),
    ])
  })

  it('propagates accepted/legacy history query failures instead of returning empty arrays', async () => {
    const db = fakeSupabase(
      {
        ai_eval_criteria: [],
        ai_eval_cases: [],
        ai_eval_results: [],
        ai_agent_versions: [],
        agent_traces: [],
      },
      { agent_traces: new Error('trace history unavailable') }
    )

    await expect(listEval(db.client, 'agent-1', 'org-1')).rejects.toThrow(
      'trace history unavailable'
    )
  })
})
