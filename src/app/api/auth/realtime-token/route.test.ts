import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---- Mocks (hoisted) ----
const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { auth: { getUser: (...args: any[]) => mockGetUser(...args) } },
}))

import { GET } from './route'

// JWT valido o suficiente pro decodeExpiry ler o claim `exp` (assinatura
// nao importa aqui — supabaseAdmin.auth.getUser e mockado).
const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600
function fakeJwt(exp: number | undefined = FUTURE_EXP): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')
  const payload = Buffer.from(JSON.stringify(exp === undefined ? {} : { exp })).toString(
    'base64',
  )
  return `${header}.${payload}.sig`
}

function req(cookieToken?: string): any {
  return {
    cookies: {
      get: (name: string) =>
        name === 'sb-access-token' && cookieToken ? { value: cookieToken } : undefined,
    },
    headers: new Headers(),
  }
}

describe('GET /api/auth/realtime-token', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetUser.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  })

  it('retorna o token do cookie quando autenticado, sem cache, com expiresAt', async () => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    const token = fakeJwt()
    const res = await GET(req(token))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.token).toBe(token)
    expect(data.expiresAt).toBe(FUTURE_EXP)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(mockGetUser).toHaveBeenCalledWith(token)
  })

  it('propaga a NextResponse de erro do requireOrgFromAuth', async () => {
    mockAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    )
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('retorna 401 se autenticado por Authorization header mas sem cookie', async () => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    const res = await GET(req(undefined))
    expect(res.status).toBe(401)
  })

  it('retorna 401 para o token dev-access-token (dev bypass nao vale no realtime)', async () => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    const res = await GET(req('dev-access-token'))
    expect(res.status).toBe(401)
  })

  it('retorna 401 se o cookie nao resolve a um usuario valido (stale/garbage) mesmo com requireOrgFromAuth OK', async () => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
    const res = await GET(req(fakeJwt()))
    expect(res.status).toBe(401)
  })
})
