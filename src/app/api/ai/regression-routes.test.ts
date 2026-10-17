// Regression contracts for public handler boundaries: auth, query scope,
// mutation payloads and response bodies. Only database/network I/O is replaced.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { auth, admin } = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: auth }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: admin }))
vi.mock('@/lib/ai/budget', () => ({ checkAiBudget: vi.fn(async () => ({ budgetUsd: 50, spentUsd: 2 })) }))
vi.mock('@/lib/ai/versions', () => ({ snapshotIfChanged: vi.fn(async () => undefined) }))
vi.mock('@/lib/ai/brl', async importOriginal => ({ ...await importOriginal<any>(), usdToBrlRate: vi.fn(async () => 5) }))

import { GET as csv } from './activity/export.csv/route'
import { GET as events } from './activity/events/route'
import { GET as summary } from './activity/summary/route'
import { GET as gaps, POST as createGap } from './knowledge/gaps/route'
import { GET as usage } from './knowledge/[id]/usage/route'
import { PUT as readers } from './knowledge/[id]/agents/route'
import { GET as alerts } from './alerts/route'
import { PATCH as updateAlert } from './alerts/[id]/route'
import { PATCH as saveAgent } from './agents/[id]/route'

type Query = { table: string; calls: Array<[string, ...unknown[]]> }
const queries: Query[] = []
let results: Record<string, { data: any; error?: any; count?: number }>
function database() {
  return { from(table: string) {
    const query: Query = { table, calls: [] }
    queries.push(query)
    const chain: any = { then(resolve: any) { return Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve) } }
    for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'or', 'contains', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
      chain[method] = (...args: unknown[]) => { query.calls.push([method, ...args]); return chain }
    }
    return chain
  } }
}
function request(path = '', body?: unknown) {
  return new NextRequest(`http://localhost/api/ai/${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'note-1' }) }
function scoped(table: string) {
  const query = queries.find(q => q.table === table)
  expect(query, `${table} was not queried`).toBeDefined()
  expect(query!.calls).toContainEqual(['eq', 'organization_id', 'org-1'])
  return query!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'))
  queries.length = 0
  results = {}
  auth.mockResolvedValue({ user: { id: 'merchant-1', organization_id: 'org-1' } })
  admin.mockReset().mockReturnValue(database())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('IA regression — authorization before any database access', () => {
  const handlers = [
    () => csv(request()), () => events(request()), () => summary(request()),
    () => gaps(request()), () => createGap(request('', { question: 'Frete?' })),
    () => usage(request(), ctx), () => readers(request('', { agent_ids: [] }), ctx),
    () => alerts(request()), () => updateAlert(request('', { status: 'resolved' }), ctx),
  ]
  it.each(handlers.map((handler, index) => [index, handler] as const))('rejects unauthenticated route %i without reads or writes', async (_, handler) => {
    auth.mockResolvedValue(null)
    const response = await handler()
    expect(response.status).toBe(401)
    expect(admin).not.toHaveBeenCalled()
  })
})

describe('IA-49 IA-55 IA-57 — Activity route filters', () => {
  it('CSV applies the requested agent, period and organization to the actual outcome query', async () => {
    results.ai_conversation_outcomes = { data: [] }
    results.ai_agents = { data: [{ id: 'a-1', name: 'Duda' }] }
    const response = await csv(request('activity/export.csv?period=1&agent=a-1'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('1d.csv')
    const calls = scoped('ai_conversation_outcomes').calls
    expect(calls).toContainEqual(['eq', 'agent_id', 'a-1'])
    expect(calls).toContainEqual(['gte', 'started_at', '2026-10-15T12:00:00.000Z'])
    scoped('ai_agents')
    expect(await response.text()).toContain('conversa')
  })

  it('CSV reports database failures instead of downloading a successful empty export', async () => {
    results.ai_conversation_outcomes = { data: null, error: { message: 'query failed' } }
    const response = await csv(request('activity/export.csv'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'query failed' })
  })

  it('the event log uses the same period and agent as the dashboard and resolves contact names in the same organization', async () => {
    results.ai_activity_events = { data: [{ id: 'event-1', kind: 'handoff', contact_id: 'c-1', conversation_id: 'conv-1' }] }
    results.contacts = { data: [{ id: 'c-1', first_name: 'Ana', last_name: 'Silva' }] }
    const response = await events(request('activity/events?period=1&agent=a-1&kind=handoff&limit=999'))
    expect(response.status).toBe(200)
    expect((await response.json()).events).toEqual([expect.objectContaining({ contact_name: 'Ana Silva', conversation_id: 'conv-1' })])
    const calls = scoped('ai_activity_events').calls
    expect(calls).toContainEqual(['eq', 'agent_id', 'a-1'])
    expect(calls).toContainEqual(['eq', 'kind', 'handoff'])
    expect(calls).toContainEqual(['limit', 200])
    expect(calls).toContainEqual(['gte', 'created_at', '2026-10-15T12:00:00.000Z'])
    scoped('contacts')
  })

  it('the event log rejects a database error', async () => {
    results.ai_activity_events = { data: null, error: { message: 'unavailable' } }
    expect((await events(request())).status).toBe(500)
  })
})

describe('IA-21 IA-22 IA-30 IA-58 — the actual save route preserves builder configuration', () => {
  it('writes presentation and adaptation instead of silently dropping two runtime controls', async () => {
    results.ai_agents = { data: { id: 'a-1' } }
    const response = await saveAgent(request('', {
      presentation_mode: 'nome_funcao', client_adaptation: { mirror_tone: true, mirror_length: false },
      organization_id: 'foreign',
    }), { params: Promise.resolve({ id: 'a-1' }) })
    expect(response.status).toBe(200)
    const writes = queries.flatMap(q => q.calls).filter(c => c[0] === 'update')
    expect(writes).toEqual([['update', expect.objectContaining({
      presentation_mode: 'nome_funcao', client_adaptation: { mirror_tone: true, mirror_length: false },
    })]])
    expect(writes[0][1]).not.toHaveProperty('organization_id')
    scoped('ai_agents')
  })
})

describe('IA-42 — knowledge usage comes from retrieval and actual outcomes', () => {
  it('a note outside the organization cannot expose tools or conversations', async () => {
    results.ai_sources = { data: null }
    expect((await usage(request(), ctx)).status).toBe(404)
    scoped('ai_sources')
    expect(queries.map(q => q.table)).toEqual(['ai_sources'])
  })

  it('returns only questions that retrieved this source, with transfer from outcomes', async () => {
    results.ai_sources = { data: { id: 'note-1' } }
    results.ai_runtime_activity_tools = { data: [
      { conversation_id: 'c-1', input: { query: 'Trocar?' }, output: { chunks: [{ source_id: 'note-1' }] }, created_at: '2026-10-16T10:00:00Z' },
      { conversation_id: 'c-2', input: { query: 'Outra fonte' }, output: { chunks: [{ source_id: 'note-2' }] }, created_at: '2026-10-16T10:00:00Z' },
    ] }
    results.ai_runtime_activity = { data: [{ conversation_id: 'c-1', agent_name: 'Duda' }] }
    results.ai_conversation_outcomes = { data: [{ conversation_id: 'c-1', transferred: true }] }
    const response = await usage(request(), ctx)
    const data = await response.json()
    expect(data.total).toBe(1)
    expect(data.questions).toEqual([{ question: 'Trocar?', conversation_id: 'c-1', at: '2026-10-16T10:00:00Z', agent_name: 'Duda', transferred: true }])
    for (const table of ['ai_sources', 'ai_runtime_activity_tools', 'ai_runtime_activity', 'ai_conversation_outcomes']) scoped(table)
  })
})

describe('IA-28 IA-40 IA-44 IA-45 — readers and manual knowledge gaps', () => {
  it('refuses a reader from another organization before replacing any reader', async () => {
    results.ai_sources = { data: { id: 'note-1' } }
    results.ai_agents = { data: [] }
    expect((await readers(request('', { agent_ids: ['foreign-agent'] }), ctx)).status).toBe(400)
    scoped('ai_agents')
    expect(queries.some(q => q.table === 'ai_source_agents')).toBe(false)
  })

  it('removing all readers only deletes this organization/source relationship, never the source', async () => {
    results.ai_sources = { data: { id: 'note-1' } }
    results.ai_source_agents = { data: null }
    const response = await readers(request('', { agent_ids: [] }), ctx)
    expect(await response.json()).toEqual({ readers: [] })
    expect(scoped('ai_source_agents').calls).toContainEqual(['eq', 'source_id', 'note-1'])
    expect(queries.filter(q => q.calls.some(c => c[0] === 'delete')).map(q => q.table)).toEqual(['ai_source_agents'])
  })

  it('does not write an empty manual gap', async () => {
    expect((await createGap(request('', { question: '   ' }))).status).toBe(400)
    expect(admin).not.toHaveBeenCalled()
  })

  it('does not attach a manual gap to another organization’s agent', async () => {
    results.ai_agents = { data: [] }
    expect((await createGap(request('', { question: 'Frete?', agent_id: 'foreign' }))).status).toBe(400)
    scoped('ai_agents')
    expect(queries.some(q => q.table === 'ai_knowledge_gaps')).toBe(false)
  })

  it('persists a manual gap under the authenticated organization with normalized question', async () => {
    results.ai_agents = { data: [{ id: 'a-1' }] }
    results.ai_knowledge_gaps = { data: { id: 'gap-1', question: 'Frete?' } }
    const response = await createGap(request('', { question: '  Frete?  ', agent_id: 'a-1', organization_id: 'foreign' }))
    expect(response.status).toBe(201)
    expect(queries.find(q => q.table === 'ai_knowledge_gaps')!.calls).toContainEqual(['insert', {
      organization_id: 'org-1', question: 'Frete?', agent_ids: ['a-1'], outcome: 'no_source', count: 1,
    }])
  })
})

describe('IA-56 — alert state changes are scoped and persistent', () => {
  it.each(['acknowledged', 'resolved'])('writes %s only to the authenticated organization', async status => {
    results.alerts = { data: { id: 'alert-1', status } }
    const response = await updateAlert(request('', { status }), { params: Promise.resolve({ id: 'alert-1' }) })
    expect(await response.json()).toEqual({ alert: { id: 'alert-1', status } })
    const calls = scoped('alerts').calls
    expect(calls).toContainEqual(['eq', 'id', 'alert-1'])
    expect(calls).toContainEqual(['update', status === 'acknowledged'
      ? { status, acknowledged_at: '2026-10-16T12:00:00.000Z', acknowledged_by: 'merchant-1' }
      : { status, resolved_at: '2026-10-16T12:00:00.000Z' }])
  })

  it('refuses invalid status without a write', async () => {
    expect((await updateAlert(request('', { status: 'open' }), ctx)).status).toBe(400)
    expect(admin).not.toHaveBeenCalled()
  })

  it('returns 404 for an alert not found within the organization', async () => {
    results.alerts = { data: null }
    expect((await updateAlert(request('', { status: 'resolved' }), ctx)).status).toBe(404)
    scoped('alerts')
  })
})

describe('IA-23 — model catalogue normalizes third party output and degrades safely', () => {
  it('does not contact the provider before authorization', async () => {
    auth.mockResolvedValue(null)
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    vi.resetModules()
    const { GET } = await import('./openrouter-models/route')
    expect((await GET()).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('maps text models, pricing per million and drops image-only output', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [
      { id: 'text/model', name: 'Model', pricing: { prompt: '0.000002', completion: '0.000003' }, context_length: 8000 },
      { id: 'image/model', architecture: { output_modalities: ['image'] } },
    ] }), { status: 200 })))
    const { GET } = await import('./openrouter-models/route')
    expect(await (await GET()).json()).toEqual({ models: [{ id: 'text/model', name: 'Model', prompt_per_m: 2, completion_per_m: 3, context: 8000 }] })
  })

  it('provider outage returns a usable empty catalogue with an error for the UI fallback', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const { GET } = await import('./openrouter-models/route')
    expect(await (await GET()).json()).toEqual({ models: [], error: 'offline' })
  })
})
