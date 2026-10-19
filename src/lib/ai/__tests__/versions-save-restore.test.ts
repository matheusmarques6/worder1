import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { rollbackToVersion } from '../versions'

const { auth, admin } = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: auth }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: admin }))
import { PATCH, PUT } from '@/app/api/ai/agents/[id]/route'

const initial = { id: 'agent-qa', organization_id: 'org-qa', name: 'Inicial', provider: 'openrouter', model: 'openai/gpt-4.1-mini',
  monthly_cap_usd: 2, presentation_mode: 'nome_funcao', client_adaptation: { mirror_tone: true },
  system_prompt: 'Instrução original', persona: { tone: 'friendly' }, settings: { tools: { enabled: ['search_knowledge'] } }, is_active: false }
let tables: Record<string, any[]>
function db() {
  return { from(table: string) {
    if (!Object.hasOwn(tables, table)) throw new Error(`Unexpected database table ${table}`)
    const predicates: Array<(row: any) => boolean> = []
    let action = 'select', payload: any, single = false, descending = false, limit = Infinity
    let order: string | undefined
    let selected: string[] | undefined
    const query: any = {
      select(columns = '*') { selected = columns === '*' ? undefined : columns.split(/,\s*/); return query },
      eq(key: string, value: any) { predicates.push(row => row[key] === value); return query },
      in(key: string, values: any[]) { predicates.push(row => values.includes(row[key])); return query },
      order(key: string, opts: any) { order = key; descending = opts.ascending === false; return query },
      limit(value: number) { limit = value; return query },
      single() { single = true; return query }, maybeSingle() { single = true; return query },
      update(value: any) { action = 'update'; payload = value; return query },
      insert(value: any) { action = 'insert'; payload = value; return query },
      then(resolve: any, reject: any) {
        return Promise.resolve().then(() => {
          let rows = tables[table].filter(row => predicates.every(predicate => predicate(row)))
          if (action === 'insert') { rows = (Array.isArray(payload) ? payload : [payload]).map(value => ({ id: `version-${tables[table].length + 1}`, ...structuredClone(value) })); tables[table].push(...rows) }
          if (action === 'update') for (const row of rows) Object.assign(row, structuredClone(payload))
          if (order) rows = [...rows].sort((a, b) => (a[order!] > b[order!] ? 1 : -1) * (descending ? -1 : 1))
          rows = rows.slice(0, limit).map(row => selected ? Object.fromEntries(selected.map(key => [key, row[key]])) : structuredClone(row))
          return { data: single ? rows[0] ?? null : rows, error: null }
        }).then(resolve, reject)
      },
    }
    return query
  } }
}
beforeEach(() => {
  tables = { ai_agents: [structuredClone(initial)], ai_agent_versions: [], profiles: [] }
  auth.mockResolvedValue({ user: { id: 'merchant-qa', organization_id: 'org-qa' } })
  admin.mockReturnValue(db())
})

it.each([
  ['name', 'Renomeado'], ['presentation_mode', 'discreta'],
  ['client_adaptation', { mirror_tone: false, emoji_if_client: true }],
  ['model', 'openai/gpt-4.1'], ['monthly_cap_usd', null],
] as const)('IA-11/18 actual PATCH saves, versions and restores isolated %s', async (field, value) => {
  const request = new NextRequest('http://localhost/api/ai/agents/agent-qa', { method: 'PATCH', body: JSON.stringify({ [field]: value }) })
  expect((await PATCH(request, { params: Promise.resolve({ id: initial.id }) })).status).toBe(200)
  expect(tables.ai_agents[0][field]).toEqual(value)
  expect(tables.ai_agent_versions.map(version => version.version_number)).toEqual([1, 2])
  expect(tables.ai_agent_versions[0].change_summary.agent_fields[field]).toEqual(initial[field])
  expect(tables.ai_agent_versions[1].change_summary.agent_fields[field]).toEqual(value)
  const restored = await rollbackToVersion(db() as any, initial.id, initial.organization_id, tables.ai_agent_versions[0].id, null)
  expect(restored.version_number).toBe(3)
  expect(tables.ai_agents[0][field]).toEqual(initial[field])
  expect(tables.ai_agent_versions[2].restored_from).toBe(tables.ai_agent_versions[0].id)
})

it('PUT captures the same actual top-level settings; unchanged save creates no version', async () => {
  const request = () => new NextRequest('http://localhost', { method: 'PUT', body: JSON.stringify({ presentation_mode: 'discreta' }) })
  expect((await PUT(request(), { params: Promise.resolve({ id: initial.id }) })).status).toBe(200)
  expect(tables.ai_agent_versions).toHaveLength(2)
  expect((await PUT(request(), { params: Promise.resolve({ id: initial.id }) })).status).toBe(200)
  expect(tables.ai_agent_versions).toHaveLength(2)
})

it('legacy versions restore their recorded fields without erasing later top-level configuration', async () => {
  tables.ai_agent_versions.push({ id: 'legacy', agent_id: initial.id, organization_id: initial.organization_id,
    version_number: 1, system_prompt: 'Prompt antigo', persona: {}, settings: {} })
  await rollbackToVersion(db() as any, initial.id, initial.organization_id, 'legacy', null)
  expect(tables.ai_agents[0]).toMatchObject({ name: initial.name, presentation_mode: initial.presentation_mode,
    client_adaptation: initial.client_adaptation, system_prompt: 'Prompt antigo' })
})

it('version metadata cannot overwrite identity or arbitrary database columns', async () => {
  tables.ai_agent_versions.push({ id: 'old', agent_id: initial.id, organization_id: initial.organization_id,
    version_number: 1, system_prompt: initial.system_prompt, persona: {}, settings: {},
    change_summary: { agent_fields: { organization_id: 'other-org', id: 'other-id', is_active: true, name: 'Restaurado' } } })
  await rollbackToVersion(db() as any, initial.id, initial.organization_id, 'old', null)
  expect(tables.ai_agents[0]).toMatchObject({ id: initial.id, organization_id: initial.organization_id, is_active: false, name: 'Restaurado' })
})
