import { expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase
vi.mock('@/lib/supabase-admin', () => ({ get supabaseAdmin() { return db } }))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ supabase: db, user: { id: 'fixture-user', organization_id: 'fixture-org' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))

it('roundtrips original HTML and design through create, update and read without rewriting legacy emails', async () => {
  let saved: Record<string, unknown> = { id: 'fixture-template' }
  db = fakeSupabase({ rows: { email_templates: query => {
    if (query.written) saved = { ...saved, ...structuredClone(query.written) }
    return [structuredClone(saved)]
  } } })
  const { POST } = await import('../route')
  const { PUT, GET } = await import('../[id]/route')
  const original = '<style>.legacy{color:purple}</style><table><tr><td>Original</td></tr></table>'
  const updated = original.replace('Original', 'Atualizado')
  const design = { version: 2, sections: [{ columns: [{ blocks: [
    { id: 'legacy', type: 'html', props: { code: original } },
  ] }] }] }
  const request = (method: string, payload: unknown) => new NextRequest('https://app.test/api/email/templates', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })
  const context = { params: Promise.resolve({ id: 'fixture-template' }) }
  const created = await POST(request('POST', { name: 'Fixture', html: original, design }))
  expect(created.status).toBe(201)
  expect((await created.json()).template).toMatchObject({ html: original, design, design_json: design })
  const changed = await PUT(request('PUT', { html: updated, design_json: design }), context)
  expect(changed.status).toBe(200)
  const read = await GET(new NextRequest('https://app.test/api/email/templates/fixture-template'), context)
  expect(read.status).toBe(200)
  expect((await read.json()).template).toMatchObject({ html: updated, design, design_json: design })
})
