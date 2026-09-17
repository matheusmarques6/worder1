import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

function request(pathname: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${pathname}`, { headers })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('local audit report', () => {
  it('serves the audit HTML without authentication during local development', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const response = await middleware(request('/auditoria-motor-ia.html'))

    expect(response.status).toBe(200)
  })

  it('does not expose the audit HTML in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = await middleware(request('/auditoria-motor-ia.html'))

    expect(response.status).toBe(404)
  })
})

describe('middleware internal document processing', () => {
  it('lets only the exact document processing pathname reach its handler without cookies', async () => {
    const response = await middleware(request('/api/ai/process/document', {
      authorization: 'Bearer internal-secret',
    }))

    expect(response.status).toBe(200)
  })

  it('keeps sibling AI APIs behind the session-cookie guard', async () => {
    const response = await middleware(request('/api/ai/other', {
      authorization: 'Bearer internal-secret',
    }))

    expect(response.status).toBe(401)
  })
})
