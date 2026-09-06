import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetSupabaseAdmin = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}))

import { POST } from './route'

const ORIGINAL_ENV = { ...process.env }

function request(headers: HeadersInit = {}) {
  return new NextRequest('http://localhost/api/ai/process/document', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ source_id: 'source-1', organization_id: 'org-1' }),
  })
}

describe('/api/ai/process/document internal authorization', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, INTERNAL_API_SECRET: 'internal-secret' }
    delete process.env.CRON_SECRET
    mockGetSupabaseAdmin.mockReset()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it.each<HeadersInit>([{}, { authorization: 'Bearer wrong-secret' }])('rejects missing or wrong Bearer before accessing the handler dependencies', async (headers) => {
    const response = await POST(request(headers))

    expect(response.status).toBe(401)
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled()
  })
})
