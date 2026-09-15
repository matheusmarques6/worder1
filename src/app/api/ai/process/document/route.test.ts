import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetSupabaseAdmin = vi.fn()
const mockCheckAiBudget = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}))

vi.mock('@/lib/ai/budget', () => ({
  checkAiBudget: (...args: any[]) => mockCheckAiBudget(...args),
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
    mockCheckAiBudget.mockReset()
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    })
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it.each<HeadersInit>([{}, { authorization: 'Bearer wrong-secret' }])('rejects missing or wrong Bearer before accessing the handler dependencies', async (headers) => {
    const response = await POST(request(headers))

    expect(response.status).toBe(401)
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('returns 503 and preserves lookup_error when budget lookup is unavailable', async () => {
    mockCheckAiBudget.mockResolvedValue({
      allowed: false,
      budgetUsd: null,
      spentUsd: 0,
      hasUnknownCost: false,
      unknownReason: 'lookup_error',
    })

    const response = await POST(request({ authorization: 'Bearer internal-secret' }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      code: 'AI_BUDGET_UNAVAILABLE',
      unknownReason: 'lookup_error',
    })
  })

  it('keeps a known exhausted budget as 402', async () => {
    mockCheckAiBudget.mockResolvedValue({
      allowed: false,
      budgetUsd: 50,
      spentUsd: 50,
      hasUnknownCost: false,
    })

    const response = await POST(request({ authorization: 'Bearer internal-secret' }))

    expect(response.status).toBe(402)
  })
})
