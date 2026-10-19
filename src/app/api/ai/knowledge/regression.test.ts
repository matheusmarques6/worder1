// Real handlers and Markdown transforms; only persistence/provider I/O replaced.
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { auth, admin, embedding, key, processing } = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), embedding: vi.fn(), key: vi.fn(), processing: vi.fn() }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: auth }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: admin }))
vi.mock('@/lib/ai/embeddings', () => ({ generateEmbedding: embedding }))
vi.mock('@/lib/ai/embedding-key', () => ({ resolveEmbeddingKey: key }))
vi.mock('@/lib/ai/knowledge/process-trigger', async original => ({ ...await original<any>(), triggerSourceProcessing: processing }))
import { PATCH as edit, GET as read } from './[id]/route'
import { POST as create } from './route'
import { POST as ask } from './ask/route'
import { POST as csv } from './import/csv/route'
import { POST as urlSource } from '../agents/[id]/sources/route'
import { POST as documentSource } from '../agents/[id]/sources/upload/route'

let replies: Record<string, any[]>
let queries: Array<{ table: string; calls: Array<[string, ...any[]]> }>
const rpc = vi.fn()
const storageUpload = vi.fn()
function database() {
  return { rpc, from(table: string) {
    const query = { table, calls: [] as Array<[string, ...any[]]> }
    queries.push(query)
    const chain: any = { then(resolve: any, reject: any) {
      if (!replies[table]?.length) throw new Error(`Unplanned database request: ${table}`)
      return Promise.resolve(replies[table].shift()).then(resolve, reject)
    } }
    for (const method of ['select', 'eq', 'neq', 'contains', 'in', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
      chain[method] = (...args: any[]) => { query.calls.push([method, ...args]); return chain }
    }
    return chain
  } }
}
const data = (value: any) => ({ data: value, error: null })
const context = { params: Promise.resolve({ id: 'note-qa' }) }
const request = (body: unknown) => new NextRequest('http://localhost/api/ai/knowledge', { method: 'POST', body: JSON.stringify(body) })
function orgReadsAndUpdates() {
  for (const query of queries) if (!query.calls.some(call => call[0] === 'insert')) expect(query.calls).toContainEqual(['eq', 'organization_id', 'org-qa'])
}
beforeEach(() => {
  queries = []; replies = {}; rpc.mockReset()
  storageUpload.mockReset().mockResolvedValue({ data: { path: 'qa-path' }, error: null })
  admin.mockReset().mockReturnValue({ ...database(), storage: { from: () => ({ upload: storageUpload,
    getPublicUrl: () => ({ data: { publicUrl: 'https://qa.example.test/storage/guide.txt' } }),
  }) } })
  auth.mockResolvedValue({ user: { id: 'merchant-qa', organization_id: 'org-qa' } })
  embedding.mockReset().mockResolvedValue([0.1, 0.2]); key.mockReset().mockResolvedValue('test-key')
  processing.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

for (const [name, handler] of [['edit', edit], ['read', read], ['create', create], ['ask', ask], ['csv', csv]] as const) {
  it(`knowledge ${name} rejects missing session before database/provider I/O`, async () => {
    auth.mockResolvedValue(null)
    expect((await (handler as any)(request({}), context)).status).toBe(401)
    expect(admin).not.toHaveBeenCalled(); expect(embedding).not.toHaveBeenCalled()
  })
}
it('IA-38 actual autosave persists Markdown, parsed links and pending processing in the current organization', async () => {
  replies.ai_sources = [data({ id: 'note-qa', name: 'Nota', read_only: false }), data({ id: 'note-qa', status: 'pending' })]
  expect((await edit(request({ body_markdown: 'Leia [[Trocas]] e [[Frete|prazo]].' }), context)).status).toBe(200)
  expect(queries[1].calls).toContainEqual(['update', expect.objectContaining({ body_markdown: 'Leia [[Trocas]] e [[Frete|prazo]].', text_content: 'Leia [[Trocas]] e [[Frete|prazo]].', links: ['Trocas', 'Frete'], status: 'pending', updated_by: 'merchant-qa' })])
  expect(processing).toHaveBeenCalledWith('note-qa', 'org-qa'); orgReadsAndUpdates()
})
it('IA-38 synchronized notes reject content writes and foreign notes are 404', async () => {
  replies.ai_sources = [data({ id: 'note-qa', read_only: true }), data(null)]
  expect((await edit(request({ body_markdown: 'alteração' }), context)).status).toBe(409)
  expect((await edit(request({ body_markdown: 'alteração' }), context)).status).toBe(404)
  expect(queries.every(query => !query.calls.some(call => call[0] === 'update'))).toBe(true)
  expect(processing).not.toHaveBeenCalled(); orgReadsAndUpdates()
})
it('IA-39 rename rewrites exact wiki targets and retains aliases in other owned notes', async () => {
  replies.ai_sources = [data({ id: 'note-qa', name: 'Antigo' }), data({ id: 'note-qa', name: 'Novo' }),
    data([{ id: 'backlink', body_markdown: '[[Antigo]] [[Antigo|rótulo]] [[Outro]]' }]), data(null)]
  const response = await edit(request({ name: 'Novo' }), context)
  expect((await response.json()).relinked).toBe(1)
  expect(queries[3].calls).toContainEqual(['update', { body_markdown: '[[Novo]] [[Novo|rótulo]] [[Outro]]', text_content: '[[Novo]] [[Novo|rótulo]] [[Outro]]', links: ['Novo', 'Outro'] }])
  expect(queries[3].calls).toContainEqual(['eq', 'id', 'backlink']); orgReadsAndUpdates()
})
it('IA-41 note creation links only owned readers and starts real processing boundary', async () => {
  replies.ai_agents = [data([{ id: 'agent-qa' }])]
  replies.ai_sources = [data({ id: 'created-note', name: 'Prazo' })]
  replies.ai_source_agents = [data(null), data(null)]
  expect((await create(request({ name: 'Prazo', body_markdown: 'Resposta', agent_ids: ['agent-qa'] }))).status).toBe(201)
  expect(queries.find(query => query.table === 'ai_sources')?.calls).toContainEqual(['insert', expect.objectContaining({ organization_id: 'org-qa', body_markdown: 'Resposta' })])
  expect(queries.at(-1)?.calls).toContainEqual(['insert', [{ source_id: 'created-note', agent_id: 'agent-qa', organization_id: 'org-qa' }]])
  expect(processing).toHaveBeenCalledWith('created-note', 'org-qa'); orgReadsAndUpdates()
})
for (const kind of ['text', 'regra', 'resposta']) {
  it(`IA-44 knowledge ask returns actual ${kind} retrieval metadata with source provenance`, async () => {
    replies.ai_agents = [data({ id: 'agent-qa', name: 'Nina' })]
    replies.ai_sources = [data([{ id: 'source-qa', name: 'Trocas' }])]
    rpc.mockResolvedValue(data([{ chunk_id: 'chunk-qa', source_id: 'source-qa', content: '37 dias', metadata: { chunk_kind: kind }, similarity: 0.92345 }]))
    const response = await ask(request({ agent_id: 'agent-qa', question: 'Prazo?', organization_id: 'foreign' }))
    expect(await response.json()).toMatchObject({ answered: true, best: { content: '37 dias', source_id: 'source-qa', source_name: 'Trocas', chunk_kind: kind, similarity: 0.923 }, hit_rule: kind === 'regra', hit_answer: kind === 'resposta' })
    expect(rpc).toHaveBeenCalledWith('search_agent_knowledge', expect.objectContaining({ p_agent_id: 'agent-qa', p_organization_id: 'org-qa' }))
    expect(embedding).toHaveBeenCalledWith('Prazo?', 'test-key', 'org-qa'); orgReadsAndUpdates()
  })
}
it('IA-44 retrieval miss returns no invented answer', async () => {
  replies.ai_agents = [data({ id: 'agent-qa', name: 'Nina' })]; rpc.mockResolvedValue(data([]))
  expect(await (await ask(request({ agent_id: 'agent-qa', question: 'Sem fonte?' }))).json()).toMatchObject({ answered: false, best: null, others: [] })
})
it('IA-44 missing OpenAI key and foreign agent fail before embedding/search', async () => {
  replies.ai_agents = [data({ id: 'agent-qa' }), data(null)]; key.mockResolvedValue(null)
  expect((await ask(request({ agent_id: 'agent-qa', question: 'Prazo?' }))).status).toBe(422)
  expect((await ask(request({ agent_id: 'foreign', question: 'Prazo?' }))).status).toBe(404)
  expect(embedding).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled(); orgReadsAndUpdates()
})
for (const mode of ['faq', 'notes']) {
  it(`IA-47 CSV import ${mode} creates parsed notes and only owned reader relations`, async () => {
    replies.ai_agents = [data([{ id: 'agent-qa' }])]
    replies.ai_sources = [data([{ id: 'import-qa', name: 'Troca' }])]; replies.ai_source_agents = [data(null)]
    const response = await csv(request({ csv: 'pergunta,resposta\nQual o prazo?,37 dias', mode, agent_ids: ['agent-qa'] }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ rows: 1, imported: 1, mode })
    expect(queries[1].calls).toContainEqual(['insert', [expect.objectContaining({ organization_id: 'org-qa', kind: mode === 'faq' ? 'faq' : 'note', body_markdown: expect.stringContaining('37 dias') })]])
    expect(queries[2].calls).toContainEqual(['insert', [{ source_id: 'import-qa', agent_id: 'agent-qa', organization_id: 'org-qa' }]])
    expect(processing).toHaveBeenCalledWith('import-qa', 'org-qa'); orgReadsAndUpdates()
  })
}
it('IA-47 CSV import rejects foreign readers before creating any source', async () => {
  replies.ai_agents = [data([])]
  expect((await csv(request({ csv: 'pergunta,resposta\nPrazo?,37 dias', agent_ids: ['foreign'] }))).status).toBe(400)
  expect(queries).toHaveLength(1); orgReadsAndUpdates()
})

const agentContext = { params: Promise.resolve({ id: 'agent-qa' }) }
function previewProcessing() {
  vi.stubEnv('INTERNAL_API_SECRET', 'internal-test-secret')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://older.example.test')
  vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('VERCEL_URL', 'worder-qa-candidate.vercel.app')
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
it('IA-47 page import persists its owned URL and processes on the immutable candidate origin', async () => {
  const fetch = previewProcessing()
  replies.ai_agents = [data({ id: 'agent-qa' })]; replies.ai_agent_sources = [data({ id: 'url-qa' })]
  const response = await urlSource(request({ source_type: 'url', name: 'Medidas', url: 'https://example.test/medidas', organization_id: 'foreign' }), agentContext)
  expect(response.status).toBe(201)
  expect(queries[0].calls).toEqual(expect.arrayContaining([['eq', 'id', 'agent-qa'], ['eq', 'organization_id', 'org-qa']]))
  expect(queries[1].calls).toContainEqual(['insert', expect.objectContaining({ organization_id: 'org-qa', agent_id: 'agent-qa', url: 'https://example.test/medidas', status: 'pending' })])
  expect(fetch).toHaveBeenCalledWith('https://worder-qa-candidate.vercel.app/api/ai/process/document', expect.objectContaining({ body: JSON.stringify({ source_id: 'url-qa', organization_id: 'org-qa' }) }))
})
it('IA-47 foreign page reader is rejected before source insertion or processing', async () => {
  const fetch = previewProcessing(); replies.ai_agents = [data(null)]
  expect((await urlSource(request({ source_type: 'url', name: 'Medidas', url: 'https://example.test/medidas' }), agentContext)).status).toBe(404)
  expect(queries).toHaveLength(1); expect(fetch).not.toHaveBeenCalled()
  expect(queries[0].calls).toContainEqual(['eq', 'organization_id', 'org-qa'])
})
function uploadRequest() {
  const form = new FormData()
  form.append('file', new File(['Guia de troca'], 'guia.txt', { type: 'text/plain' }))
  form.append('organization_id', 'foreign')
  return new NextRequest('http://localhost', { method: 'POST', body: form })
}
it('IA-47 document import scopes storage and source rows and processes on the candidate revision', async () => {
  const fetch = previewProcessing()
  replies.ai_agents = [data({ id: 'agent-qa' })]; replies.ai_agent_sources = [data({ id: 'doc-qa' })]
  expect((await documentSource(uploadRequest(), agentContext)).status).toBe(201)
  expect(storageUpload).toHaveBeenCalledWith(expect.stringMatching(/^org-qa\/agent-qa\/\d+_guia\.txt$/), expect.any(Buffer), expect.objectContaining({ contentType: 'text/plain' }))
  expect(queries[0].calls).toContainEqual(['eq', 'organization_id', 'org-qa'])
  expect(queries[1].calls).toContainEqual(['insert', expect.objectContaining({ organization_id: 'org-qa', agent_id: 'agent-qa', source_type: 'file', mime_type: 'text/plain' })])
  expect(fetch).toHaveBeenCalledWith('https://worder-qa-candidate.vercel.app/api/ai/process/document', expect.objectContaining({ body: JSON.stringify({ source_id: 'doc-qa', organization_id: 'org-qa', file_content: Buffer.from('Guia de troca').toString('base64'), mime_type: 'text/plain' }) }))
})
it('IA-47 document import rejects another organization’s reader before storage or rows', async () => {
  const fetch = previewProcessing(); replies.ai_agents = [data(null)]
  expect((await documentSource(uploadRequest(), agentContext)).status).toBe(404)
  expect(queries).toHaveLength(1); expect(storageUpload).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  expect(queries[0].calls).toContainEqual(['eq', 'organization_id', 'org-qa'])
})
