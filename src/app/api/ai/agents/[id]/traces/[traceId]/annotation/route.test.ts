import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/api-utils', () => ({
  getAuthClient: () => mocks.auth(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}))

import { PUT } from './route'

const context = { params: { id: 'agent-1', traceId: 'trace-1' } }

function request(body: Record<string, unknown>) {
  return new NextRequest(
    'http://localhost/api/ai/agents/agent-1/traces/trace-1/annotation',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

function authenticated(role: string) {
  return {
    user: {
      id: 'user-1',
      email: 'owner@example.test',
      organization_id: 'org-session',
      role,
    },
  }
}

function adminDb(
  options: { agent?: boolean; trace?: boolean; agentError?: Error; traceError?: Error } = {}
) {
  const upserts: Array<{ payload: Record<string, unknown>; options: unknown }> = []
  const filters = new Map<string, Array<[string, unknown]>>()
  const from = vi.fn((table: string) => {
    const tableFilters: Array<[string, unknown]> = []
    filters.set(table, tableFilters)
    const hasFilters = (expected: Array<[string, unknown]>) =>
      expected.every(([field, value]) =>
        tableFilters.some(([actualField, actualValue]) =>
          actualField === field && actualValue === value
        )
      )
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((field: string, value: unknown) => {
        tableFilters.push([field, value])
        return chain
      }),
      maybeSingle: vi.fn(async () => {
        const error =
          table === 'ai_agents'
            ? options.agentError ?? null
            : table === 'agent_traces'
              ? options.traceError ?? null
              : null
        return {
          data: error
            ? null
            : table === 'ai_agents'
              ? options.agent === false || !hasFilters([
                  ['id', 'agent-1'],
                  ['organization_id', 'org-session'],
                ])
                ? null
                : { id: 'agent-1', organization_id: 'org-session' }
              : table === 'agent_traces'
                ? options.trace === false || !hasFilters([
                    ['id', 'trace-1'],
                    ['organization_id', 'org-session'],
                    ['agent_id', 'agent-1'],
                  ])
                  ? null
                  : {
                      id: 'trace-1',
                      organization_id: 'org-session',
                      agent_id: 'agent-1',
                    }
                : null,
          error,
        }
      }),
      single: vi.fn(async () => {
        if (table === 'agent_trace_annotations') {
          const payload = upserts.at(-1)?.payload
          return { data: { id: 'annotation-1', ...payload }, error: null }
        }
        return chain.maybeSingle()
      }),
      upsert: vi.fn((payload: Record<string, unknown>, upsertOptions: unknown) => {
        upserts.push({ payload, options: upsertOptions })
        return chain
      }),
    }
    return chain
  })

  return { client: { from }, filters, upserts }
}

describe('PUT /api/ai/agents/[id]/traces/[traceId]/annotation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 without a session and never creates the admin client', async () => {
    mocks.auth.mockResolvedValue(null)

    const response = await PUT(request({ rating: 'good' }), context)

    expect(response.status).toBe(401)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it.each(['member', 'analyst', 'agent'])(
    'returns 403 for %s before any privileged DML',
    async (role) => {
      mocks.auth.mockResolvedValue(authenticated(role))

      const response = await PUT(request({ rating: 'good' }), context)

      expect(response.status).toBe(403)
      expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
    }
  )

  it.each([
    { body: { rating: 'unknown' }, name: 'an unknown rating' },
    { body: { rating: 'fix' }, name: 'fix without correctionText' },
    { body: { rating: 'fix', correctionText: '   ' }, name: 'fix with blank correctionText' },
  ])('returns 400 for $name', async ({ body }) => {
    mocks.auth.mockResolvedValue(authenticated('owner'))

    const response = await PUT(request(body), context)

    expect(response.status).toBe(400)
  })

  it('returns 404 when the route agent is outside the session organization', async () => {
    const db = adminDb({ agent: false })
    mocks.auth.mockResolvedValue(authenticated('owner'))
    mocks.getSupabaseAdmin.mockReturnValue(db.client)

    const response = await PUT(request({ rating: 'good' }), context)

    expect(response.status).toBe(404)
    expect(db.upserts).toHaveLength(0)
  })

  it('returns 404 when the route trace is outside the session organization or agent', async () => {
    const db = adminDb({ trace: false })
    mocks.auth.mockResolvedValue(authenticated('owner'))
    mocks.getSupabaseAdmin.mockReturnValue(db.client)

    const response = await PUT(request({ rating: 'good' }), context)

    expect(response.status).toBe(404)
    expect(db.upserts).toHaveLength(0)
  })

  it.each([
    { name: 'agent lookup', options: { agentError: new Error('agent query failed') } },
    { name: 'trace lookup', options: { traceError: new Error('trace query failed') } },
  ])('returns 500 when $name fails instead of masking it as 404', async ({ options }) => {
    const db = adminDb(options)
    mocks.auth.mockResolvedValue(authenticated('owner'))
    mocks.getSupabaseAdmin.mockReturnValue(db.client)

    const response = await PUT(request({ rating: 'good' }), context)

    expect(response.status).toBe(500)
    expect(db.upserts).toHaveLength(0)
  })

  it.each(['owner', 'admin'])('upserts for %s using only route and session identity', async (role) => {
    const db = adminDb()
    mocks.auth.mockResolvedValue(authenticated(role))
    mocks.getSupabaseAdmin.mockReturnValue(db.client)

    const response = await PUT(
      request({
        rating: 'fix',
        correctionText: 'Resposta corrigida',
        organization_id: 'org-body-must-not-win',
        agent_id: 'agent-body-must-not-win',
        annotated_by: 'user-body-must-not-win',
      }),
      context
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.annotation).toMatchObject({
      trace_id: 'trace-1',
      rating: 'fix',
      correction_text: 'Resposta corrigida',
    })
    expect(db.filters.get('ai_agents')).toEqual([
      ['id', 'agent-1'],
      ['organization_id', 'org-session'],
    ])
    expect(db.filters.get('agent_traces')).toEqual([
      ['id', 'trace-1'],
      ['organization_id', 'org-session'],
      ['agent_id', 'agent-1'],
    ])
    expect(db.upserts).toEqual([
      {
        payload: {
          organization_id: 'org-session',
          agent_id: 'agent-1',
          trace_id: 'trace-1',
          rating: 'fix',
          correction_text: 'Resposta corrigida',
          annotated_by: 'user-1',
          updated_at: expect.any(String),
        },
        options: { onConflict: 'trace_id' },
      },
    ])
  })
})
