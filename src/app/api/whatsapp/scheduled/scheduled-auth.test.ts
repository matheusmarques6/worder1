// src/app/api/whatsapp/scheduled/scheduled-auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Builder de query chainable e awaitable
function makeQuery(result: any) {
  const q: any = {}
  for (const m of ['select', 'eq', 'order', 'range', 'update', 'insert', 'delete', 'single']) {
    q[m] = vi.fn().mockReturnValue(q)
  }
  q.then = (resolve: any) => Promise.resolve(result).then(resolve)
  return q
}

const profileQuery = makeQuery({ data: { organization_id: 'org-do-token' }, error: null })
const msgQuery = makeQuery({ data: [], error: null, count: 0 })

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: vi.fn((table: string) => (table === 'profiles' ? profileQuery : msgQuery)),
  },
}))

import { GET } from './route'

describe('GET /api/whatsapp/scheduled — auth de sessão (P1 v2)', () => {
  beforeEach(() => {
    msgQuery.eq.mockClear()
  })

  it('retorna 401 sem token (nem cookie nem Bearer)', async () => {
    const req = new NextRequest('http://localhost/api/whatsapp/scheduled?organization_id=org-vitima')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('ignora organization_id da query e usa a org do token', async () => {
    const req = new NextRequest(
      'http://localhost/api/whatsapp/scheduled?organization_id=org-vitima',
      { headers: { cookie: 'sb-access-token=tok-valido' } }
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    // toda query em scheduled_messages é escopada na org DO TOKEN
    expect(msgQuery.eq).toHaveBeenCalledWith('organization_id', 'org-do-token')
    const orgEqCalls = msgQuery.eq.mock.calls.filter((c: any[]) => c[0] === 'organization_id')
    expect(orgEqCalls.every((c: any[]) => c[1] === 'org-do-token')).toBe(true)
  })
})
