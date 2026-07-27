import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---- Mocks (hoisted) ----
const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

import { GET } from './route'

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
  })

  it('retorna o token do cookie quando autenticado, sem cache', async () => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    const res = await GET(req('jwt-abc'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.token).toBe('jwt-abc')
    expect(res.headers.get('Cache-Control')).toContain('no-store')
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
})
