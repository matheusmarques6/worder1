// O state do Instagram nunca era gravado.
//
// A rota escrevia `state_token` e `data` — colunas que oauth_states não
// tem. O PostgREST recusava a linha inteira, em silêncio, e o passo
// seguinte (trocar o código pelo token) SEMPRE respondia "Invalid state
// token": conectar o Instagram era impossível.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return db },
  getSupabaseAdmin: () => db,
  isSupabaseConfigured: () => true,
}))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ supabase: db, user: { id: 'u-1', organization_id: 'org-1' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: { oauth_states: [] } })
  // A troca do código bate na Graph API; o teste não sai para a rede.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ error: { message: 'sem app id no teste' } }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  )))
})

async function get() {
  const { GET } = await import('../route')
  const res = await GET(new NextRequest('https://app.test/api/instagram/auth'))
  return { res, body: await res.json() }
}

describe('início do OAuth do Instagram', () => {
  it('grava o state nas colunas que existem', async () => {
    const { res, body } = await get()
    expect(res.status).toBe(200)
    expect(body.state).toEqual(expect.any(String))

    const escrita = db.on('oauth_states').find((q) => q.operation === 'insert')
    expect(escrita).toBeTruthy()
    expect(Object.keys(escrita!.written!).sort()).toEqual(
      ['expires_at', 'metadata', 'organization_id', 'provider', 'state'],
    )
    expect(escrita!.written!.state).toBe(body.state)
    expect(escrita!.written!.organization_id).toBe('org-1')
    expect(escrita!.written!.provider).toBe('instagram')
  })

  it('se o state não puder ser gravado, não devolve URL de autorização', async () => {
    db = fakeSupabase({
      rows: { oauth_states: [] },
      errors: { oauth_states: { message: 'coluna inexistente', code: '42703' } },
    })
    const { res, body } = await get()
    expect(res.status).toBe(500)
    expect(body.url).toBeUndefined()
  })

  it('a troca do código lê o state pela coluna certa e consome antes de usar', async () => {
    db = fakeSupabase({
      rows: {
        oauth_states: [{
          id: 's-1',
          organization_id: 'org-1',
          metadata: { organization_id: 'org-1' },
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }],
      },
    })
    const { POST } = await import('../route')
    const res = await POST(new NextRequest('https://app.test/api/instagram/auth', {
      method: 'POST',
      body: JSON.stringify({ code: 'abc', state: 'tok' }),
    }))

    const leitura = db.on('oauth_states').find((q) => q.operation === 'select')
    expect(leitura!.filters.map((f) => f.column)).toEqual(['state', 'provider'])

    const apagou = db.on('oauth_states').find((q) => q.operation === 'delete')
    expect(apagou).toBeTruthy()
    // Sem META_APP_ID de verdade a troca falha depois — o que importa
    // aqui é que o state foi lido e consumido, não o resultado.
    expect(res.status).toBeGreaterThanOrEqual(200)
  })

  it('state expirado é recusado e apagado', async () => {
    db = fakeSupabase({
      rows: {
        oauth_states: [{
          id: 's-1',
          organization_id: 'org-1',
          metadata: {},
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        }],
      },
    })
    const { POST } = await import('../route')
    const res = await POST(new NextRequest('https://app.test/api/instagram/auth', {
      method: 'POST',
      body: JSON.stringify({ code: 'abc', state: 'tok' }),
    }))
    expect(res.status).toBe(400)
    expect(db.on('oauth_states').some((q) => q.operation === 'delete')).toBe(true)
  })
})
