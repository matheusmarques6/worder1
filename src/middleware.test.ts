import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

function request(pathname: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${pathname}`, { headers })
}

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
