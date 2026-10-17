import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AGENT_TEMPLATES } from '@/lib/ai/agent-templates'
const { auth, admin } = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: auth }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: admin }))
import { POST } from './route'

let replies: Record<string, any[]>
let queries: Array<{ table: string; calls: any[][] }>
const rpc = vi.fn()
const data = (value: any) => ({ data: value, error: null })
beforeEach(() => {
  replies = {}; queries = []; rpc.mockReset()
  auth.mockResolvedValue({ user: { id: 'merchant-qa', organization_id: 'org-qa' } })
  admin.mockReturnValue({ rpc, from(table: string) {
    const query = { table, calls: [] as any[][] }; queries.push(query)
    const chain: any = { then(resolve: any, reject: any) {
      if (!replies[table]?.length) throw new Error(`Unexpected database query: ${table}`)
      return Promise.resolve(replies[table].shift()).then(resolve, reject)
    } }
    for (const method of ['select', 'eq', 'in', 'not', 'insert', 'delete', 'single', 'maybeSingle']) chain[method] = (...args: any[]) => { query.calls.push([method, ...args]); return chain }
    return chain
  } })
})
const call = (body: unknown) => POST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify(body) }))

it.each(AGENT_TEMPLATES)('IA-06/09 template $id saves its actual rules/adaptation and only its allowed mission families', async template => {
  replies.ai_agents = [data({ id: 'created-qa' })]
  replies.ai_missions = [data([{ id: 'removed-1' }, { id: 'removed-2' }])]
  rpc.mockResolvedValue(data(3))
  const response = await call({ template_id: template.id, name: 'Minha atendente' })
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ seeded_missions: 1 })
  expect(queries[0].calls).toContainEqual(['insert', expect.objectContaining({ organization_id: 'org-qa', status: 'draft',
    system_prompt: template.system_prompt, client_adaptation: template.client_adaptation,
    persona: expect.objectContaining({ guidelines: template.rules }),
    settings: expect.objectContaining({ tools: { enabled: template.tools }, judges: { custom: expect.arrayContaining([expect.objectContaining({ active: true })]) } }),
  })])
  expect(rpc).toHaveBeenCalledWith('seed_default_missions', { p_organization_id: 'org-qa', p_agent_id: 'created-qa' })
  expect(queries[1].calls).toEqual(expect.arrayContaining([
    ['delete'],
    ['eq', 'organization_id', 'org-qa'], ['eq', 'agent_id', 'created-qa'], ['eq', 'status', 'draft'],
    ['not', 'event_type', 'in', `(${template.mission_families.map(family => `"${family}"`).join(',')})`],
  ]))
})

it('IA-07/09 copy preserves configuration and only owned sources, while creating no mission ownership', async () => {
  const original = { name: 'Original', provider: 'openrouter', model: 'openai/gpt-4.1-mini', system_prompt: 'Instrução copiada',
    persona: { tone: 'professional' }, settings: { tools: { enabled: ['search_knowledge'] } },
    presentation_mode: 'discreta', client_adaptation: { mirror_tone: false }, role: 'Vendas' }
  replies.ai_agents = [data(original), data({ id: 'copy-qa' })]
  replies.ai_sources = [data([{ id: 'source-owned' }])]; replies.ai_source_agents = [data(null)]
  const response = await call({ copy_from: 'original-qa', source_ids: ['source-owned', 'source-foreign'] })
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ seeded_missions: 0, linked_sources: 1 })
  expect(queries[0].calls).toContainEqual(['eq', 'organization_id', 'org-qa'])
  expect(queries[1].calls).toContainEqual(['insert', expect.objectContaining({ name: 'Original (cópia)', status: 'draft', system_prompt: original.system_prompt,
    presentation_mode: original.presentation_mode, client_adaptation: original.client_adaptation, settings: expect.objectContaining(original.settings) })])
  expect(queries[2].table).toBe('ai_sources')
  expect(queries[2].calls).toEqual(expect.arrayContaining([
    ['eq', 'organization_id', 'org-qa'], ['in', 'id', ['source-owned', 'source-foreign']],
  ]))
  expect(queries.at(-1)?.calls).toContainEqual(['insert', [{ source_id: 'source-owned', agent_id: 'copy-qa', organization_id: 'org-qa' }]])
  expect(rpc).not.toHaveBeenCalled(); expect(queries.some(query => query.table === 'ai_missions')).toBe(false)
})
it('IA-07 foreign copy is rejected before insertion', async () => {
  replies.ai_agents = [data(null)]
  expect((await call({ copy_from: 'foreign' })).status).toBe(404)
  expect(queries).toHaveLength(1)
  expect(queries[0].calls).toContainEqual(['eq', 'organization_id', 'org-qa'])
  expect(rpc).not.toHaveBeenCalled()
})
