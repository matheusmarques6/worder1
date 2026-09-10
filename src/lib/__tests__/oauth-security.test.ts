// Uso único do state OAuth.
//
// A proteção contra replay gravava `nonce`, `user_id` e `used_at` — três
// colunas que oauth_states não tem. O select era recusado (e `.single()`
// sem checar o erro devolve null, o que o código lia como "nonce
// inédito") e o insert também: nenhum state era marcado como usado, e o
// mesmo state valia quantas vezes o atacante quisesse dentro da janela
// de 10 minutos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return db },
  getSupabaseAdmin: () => db,
  isSupabaseConfigured: () => true,
}))

const ORG = 'org-1'
const USER = 'user-1'

async function modulo() {
  return await import('../oauth-security')
}

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: { oauth_states: [] } })
})

describe('state OAuth de uso único', () => {
  it('marca o nonce como usado nas colunas que existem', async () => {
    const { generateOAuthState, consumeOAuthState } = await modulo()
    const state = generateOAuthState(ORG, USER, 'shopify')

    const data = await consumeOAuthState(state, 'shopify')
    expect(data?.organizationId).toBe(ORG)

    const escrita = db.on('oauth_states').find((q) => q.operation === 'insert')
    expect(escrita).toBeTruthy()
    expect(Object.keys(escrita!.written!).sort()).toEqual(
      ['expires_at', 'metadata', 'organization_id', 'provider', 'state'],
    )
    expect(escrita!.written!.state).toEqual(expect.any(String))
    expect(escrita!.written!.metadata).toMatchObject({ user_id: USER })
  })

  it('procura o nonce pela coluna state, não por uma inexistente', async () => {
    const { generateOAuthState, consumeOAuthState } = await modulo()
    await consumeOAuthState(generateOAuthState(ORG, USER, 'meta'), 'meta')

    const leitura = db.on('oauth_states').find((q) => q.operation === 'select')
    expect(leitura!.filters.map((f) => f.column)).toEqual(['state', 'provider'])
  })

  it('nonce já gravado é replay: recusa', async () => {
    db = fakeSupabase({ rows: { oauth_states: [{ id: 'x' }] } })
    const { generateOAuthState, consumeOAuthState } = await modulo()
    const state = generateOAuthState(ORG, USER, 'shopify')
    expect(await consumeOAuthState(state, 'shopify')).toBeNull()
  })

  it('corrida no insert (23505) também é replay: recusa', async () => {
    db = fakeSupabase({
      rows: { oauth_states: [] },
      errors: { oauth_states: { message: 'duplicate key', code: '23505' } },
    })
    const { generateOAuthState, consumeOAuthState } = await modulo()
    expect(await consumeOAuthState(generateOAuthState(ORG, USER, 'shopify'), 'shopify')).toBeNull()
  })

  it('banco indisponível não libera o state (fail-closed)', async () => {
    db = fakeSupabase({
      rows: { oauth_states: [] },
      errors: { oauth_states: { message: 'connection refused', code: '08006' } },
    })
    const { generateOAuthState, consumeOAuthState } = await modulo()
    expect(await consumeOAuthState(generateOAuthState(ORG, USER, 'shopify'), 'shopify')).toBeNull()
  })

  it('assinatura adulterada nem chega ao banco', async () => {
    const { generateOAuthState, consumeOAuthState } = await modulo()
    const state = generateOAuthState(ORG, USER, 'shopify')
    const [payload] = state.split('.')
    expect(await consumeOAuthState(`${payload}.assinaturaerrada`, 'shopify')).toBeNull()
    expect(db.on('oauth_states')).toHaveLength(0)
  })

  it('provider trocado é recusado', async () => {
    const { generateOAuthState, consumeOAuthState } = await modulo()
    const state = generateOAuthState(ORG, USER, 'shopify')
    expect(await consumeOAuthState(state, 'meta')).toBeNull()
    expect(db.on('oauth_states')).toHaveLength(0)
  })
})
