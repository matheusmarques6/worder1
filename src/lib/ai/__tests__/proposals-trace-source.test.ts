import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callAI: vi.fn(),
  checkAiBudget: vi.fn(),
  resolveJudgeKey: vi.fn(),
  trackAiUsage: vi.fn(),
}))

vi.mock('@/lib/whatsapp/ai-providers', () => ({
  callAI: (...args: unknown[]) => mocks.callAI(...args),
}))
vi.mock('@/lib/ai/budget', () => ({
  checkAiBudget: (...args: unknown[]) => mocks.checkAiBudget(...args),
}))
vi.mock('@/lib/ai/judge-key', () => ({
  resolveJudgeKey: (...args: unknown[]) => mocks.resolveJudgeKey(...args),
}))
vi.mock('@/lib/ai/cost-tracker', () => ({
  trackAiUsage: (...args: unknown[]) => mocks.trackAiUsage(...args),
}))

import { generateProposals } from '../proposals'

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
    private result() {
      if (errors[this.table]) return { data: null, error: errors[this.table] }
      let rows = tables.get(this.table) ?? []
      if (
        this.table === 'agent_traces' &&
        this.selected.includes('agent_trace_annotations!inner')
      ) {
        const annotations = tables.get('agent_trace_annotations') ?? []
        rows = rows.flatMap((trace) => {
          const annotation = annotations.find((item) => item.trace_id === trace.id)
          return annotation ? [{ ...trace, annotation }] : []
        })
      } else if (
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
      if (this.ordering) {
        const { field, ascending } = this.ordering
        rows = [...rows].sort((a, b) => {
          const left = this.value(a, field)
          const right = this.value(b, field)
          if (typeof left === 'number' && typeof right === 'number') {
            return (left - right) * (ascending ? 1 : -1)
          }
          return String(left).localeCompare(String(right)) * (ascending ? 1 : -1)
        })
      }
      rows = rows.slice(0, this.max ?? 1000)
      return { data: rows, error: null }
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
        if (name !== 'list_eligible_low_eval_results') {
          throw new Error('Unexpected RPC: ' + name)
        }
        const cases = tables.get('ai_eval_cases') ?? []
        const traces = tables.get('agent_traces') ?? []
        const rows = (tables.get('ai_eval_results') ?? [])
          .filter((result) => {
            if (
              result.agent_id !== params.p_agent_id ||
              result.organization_id !== params.p_organization_id ||
              typeof result.score !== 'number' ||
              result.score >= 60
            ) return false
            const evalCase = cases.find((item) =>
              item.id === result.case_id &&
              item.agent_id === params.p_agent_id &&
              item.organization_id === params.p_organization_id
            )
            if (!evalCase) return false
            if (evalCase.source === 'scenario') return true
            if (evalCase.source !== 'annotation') return false
            return traces.some((trace) =>
              trace.id === evalCase.source_id &&
              trace.agent_id === params.p_agent_id &&
              trace.organization_id === params.p_organization_id &&
              trace.trace_source === 'runtime_accepted'
            )
          })
          .sort((a, b) => a.score - b.score)
          .slice(0, Math.min(params.p_limit ?? 20, 20))
        return { data: rows, error: null }
      },
    } as any,
    rows: (table: string) => tables.get(table) ?? [],
  }
}

describe('generateProposals trace source', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkAiBudget.mockResolvedValue(undefined)
    mocks.resolveJudgeKey.mockResolvedValue({ provider: 'openai', apiKey: 'test-key' })
    mocks.callAI.mockResolvedValue({
      content: JSON.stringify({
        proposals: [{
          title: 'Melhorar resposta',
          reason: 'Sinal humano',
          impact: 'Mais precisão',
          proposed_prompt: 'Novo prompt completo',
        }],
      }),
      usage: {},
    })
    mocks.trackAiUsage.mockResolvedValue(undefined)
  })

  it('persists only runtime_accepted annotation traces as proposal sources', async () => {
    const db = fakeSupabase({
      agent_trace_annotations: [
        { trace_id: 'trace-accepted', agent_id: 'agent-1', organization_id: 'org-1', rating: 'bad', created_at: '2026-09-15T02:00:00Z' },
        { trace_id: 'trace-legacy', agent_id: 'agent-1', organization_id: 'org-1', rating: 'fix', correction_text: 'legacy correction', created_at: '2026-09-15T01:00:00Z' },
      ],
      agent_traces: [
        { id: 'trace-accepted', agent_id: 'agent-1', organization_id: 'org-1', trace_source: 'runtime_accepted', input: 'accepted input', output: 'accepted output' },
        { id: 'trace-legacy', agent_id: 'agent-1', organization_id: 'org-1', trace_source: 'legacy_generated', input: 'legacy input', output: 'legacy output' },
      ],
      ai_eval_results: [],
      ai_prompt_proposals: [],
    })

    await generateProposals(
      db.client,
      { id: 'agent-1', provider: 'openai', system_prompt: 'Prompt atual' } as any,
      'org-1',
      'user-1'
    )

    expect(db.rows('ai_prompt_proposals')).toEqual([
      expect.objectContaining({ source_trace_ids: ['trace-accepted'] }),
    ])
  })

  it('does not include a preexisting legacy annotation result in the proposal prompt', async () => {
    const db = fakeSupabase({
      agent_trace_annotations: [],
      agent_traces: [
        {
          id: 'trace-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'runtime_accepted',
        },
        {
          id: 'trace-legacy',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'legacy_generated',
        },
      ],
      ai_eval_cases: [
        {
          id: 'case-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          source: 'annotation',
          source_id: 'trace-accepted',
        },
        {
          id: 'case-legacy',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          source: 'annotation',
          source_id: 'trace-legacy',
        },
      ],
      ai_eval_results: [
        {
          case_id: 'case-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          score: 20,
          judged_output: 'accepted judged output',
        },
        {
          case_id: 'case-legacy',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          score: 10,
          judged_output: 'legacy judged output',
        },
      ],
      ai_prompt_proposals: [],
    })

    await generateProposals(
      db.client,
      { id: 'agent-1', provider: 'openai', system_prompt: 'Prompt atual' } as any,
      'org-1',
      'user-1'
    )

    const userPrompt = mocks.callAI.mock.calls[0][1][0].content as string
    expect(userPrompt).toContain('accepted judged output')
    expect(userPrompt).not.toContain('legacy judged output')
  })

  it('still proposes from an eligible result after 1001 lower-scored legacy results', async () => {
    const legacyCases = Array.from({ length: 1001 }, (_, index) => ({
      id: `case-legacy-${index}`,
      agent_id: 'agent-1',
      organization_id: 'org-1',
      source: 'annotation',
      source_id: `trace-legacy-${index}`,
    }))
    const db = fakeSupabase({
      agent_trace_annotations: [],
      agent_traces: [
        ...legacyCases.map((evalCase) => ({
          id: evalCase.source_id,
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'legacy_generated',
        })),
        {
          id: 'trace-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'runtime_accepted',
        },
      ],
      ai_eval_cases: [
        ...legacyCases,
        {
          id: 'case-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          source: 'annotation',
          source_id: 'trace-accepted',
        },
      ],
      ai_eval_results: [
        ...legacyCases.map((evalCase, index) => ({
          case_id: evalCase.id,
          agent_id: 'agent-1',
          organization_id: 'org-1',
          score: 1,
          judged_output: `legacy judged output ${index}`,
        })),
        {
          case_id: 'case-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          score: 30,
          judged_output: 'eligible accepted output',
        },
      ],
      ai_prompt_proposals: [],
    })

    await generateProposals(
      db.client,
      { id: 'agent-1', provider: 'openai', system_prompt: 'Prompt atual' } as any,
      'org-1',
      'user-1'
    )

    expect(mocks.callAI).toHaveBeenCalledTimes(1)
    const userPrompt = mocks.callAI.mock.calls[0][1][0].content as string
    expect(userPrompt).toContain('eligible accepted output')
    expect(userPrompt).not.toContain('legacy judged output')
  })

  it('still proposes from an older accepted annotation after 1001 newer legacy annotations', async () => {
    const legacyAnnotations = Array.from({ length: 1001 }, (_, index) => ({
      trace_id: `trace-legacy-${index}`,
      agent_id: 'agent-1',
      organization_id: 'org-1',
      rating: 'bad',
      created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    const db = fakeSupabase({
      agent_trace_annotations: [
        ...legacyAnnotations,
        {
          trace_id: 'trace-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          rating: 'bad',
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
      agent_traces: [
        ...legacyAnnotations.map((annotation) => ({
          id: annotation.trace_id,
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'legacy_generated',
          input: 'legacy annotation input',
          output: 'legacy annotation output',
        })),
        {
          id: 'trace-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'runtime_accepted',
          input: 'eligible accepted annotation input',
          output: 'eligible accepted annotation output',
        },
      ],
      ai_eval_results: [],
      ai_prompt_proposals: [],
    })

    await generateProposals(
      db.client,
      { id: 'agent-1', provider: 'openai', system_prompt: 'Prompt atual' } as any,
      'org-1',
      'user-1'
    )

    expect(mocks.callAI).toHaveBeenCalledTimes(1)
    const userPrompt = mocks.callAI.mock.calls[0][1][0].content as string
    expect(userPrompt).toContain('eligible accepted annotation input')
    expect(userPrompt).not.toContain('legacy annotation input')
  })

  it('orders proposal signals by annotation recency instead of trace recency', async () => {
    const oldAnnotations = Array.from({ length: 20 }, (_, index) => ({
      trace_id: 'trace-recent-' + index,
      agent_id: 'agent-1',
      organization_id: 'org-1',
      rating: 'bad',
      created_at: '2026-01-' + String(index + 1).padStart(2, '0') + 'T00:00:00Z',
    }))
    const db = fakeSupabase({
      agent_trace_annotations: [
        ...oldAnnotations,
        {
          trace_id: 'trace-old-with-newest-annotation',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          rating: 'bad',
          created_at: '2026-10-01T00:00:00Z',
        },
      ],
      agent_traces: [
        ...oldAnnotations.map((annotation, index) => ({
          id: annotation.trace_id,
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'runtime_accepted',
          input: 'old annotation input ' + index,
          output: 'old annotation output ' + index,
          created_at: '2026-09-' + String(index + 1).padStart(2, '0') + 'T00:00:00Z',
        })),
        {
          id: 'trace-old-with-newest-annotation',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          trace_source: 'runtime_accepted',
          input: 'newest annotation input',
          output: 'newest annotation output',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      ai_eval_results: [],
      ai_prompt_proposals: [],
    })

    await generateProposals(
      db.client,
      { id: 'agent-1', provider: 'openai', system_prompt: 'Prompt atual' } as any,
      'org-1',
      'user-1'
    )

    const proposal = db.rows('ai_prompt_proposals')[0]
    expect(proposal.source_trace_ids[0]).toBe('trace-old-with-newest-annotation')
    const userPrompt = mocks.callAI.mock.calls[0][1][0].content as string
    expect(userPrompt).toContain('newest annotation input')
  })

  it('propagates an eligible low results RPC failure', async () => {
    const db = fakeSupabase(
      {
        agent_trace_annotations: [],
        agent_traces: [],
        ai_eval_results: [],
        ai_prompt_proposals: [],
      },
      { list_eligible_low_eval_results: new Error('eligible results unavailable') }
    )

    await expect(generateProposals(
      db.client,
      { id: 'agent-1', provider: 'openai', system_prompt: 'Prompt atual' } as any,
      'org-1',
      'user-1'
    )).rejects.toThrow('eligible results unavailable')
    expect(mocks.callAI).not.toHaveBeenCalled()
  })

  it('propagates the accepted annotation join query failure', async () => {
    const db = fakeSupabase(
      {
        agent_trace_annotations: [{
          trace_id: 'trace-accepted',
          agent_id: 'agent-1',
          organization_id: 'org-1',
          rating: 'bad',
        }],
        agent_traces: [],
        ai_eval_results: [],
        ai_prompt_proposals: [],
      },
      { agent_trace_annotations: new Error('accepted traces unavailable') }
    )

    await expect(generateProposals(
      db.client,
      { id: 'agent-1', provider: 'openai', system_prompt: 'Prompt atual' } as any,
      'org-1',
      'user-1'
    )).rejects.toThrow('accepted traces unavailable')
    expect(mocks.callAI).not.toHaveBeenCalled()
  })
})
