import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.fn()
const mockBudget = vi.fn()
let usageResult: { data: any[] | null; error: { message: string } | null }

const usageChain: any = new Proxy({}, {
  get(_target, property: string) {
    if (property === 'then') return (resolve: (value: typeof usageResult) => void) => resolve(usageResult)
    return () => usageChain
  },
})

vi.mock('@/lib/api-utils', () => ({
  getAuthClient: () => mockAuth(),
  authError: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: () => usageChain },
}))

vi.mock('@/lib/ai/budget', () => ({
  checkAiBudget: (...args: any[]) => mockBudget(...args),
}))

import { GET } from './route'

function request() {
  return new NextRequest('http://localhost/api/ai/usage?period=30d&group_by=day')
}

describe('GET /api/ai/usage', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockBudget.mockReset()
    mockAuth.mockResolvedValue({ user: { organization_id: 'org-1' } })
    mockBudget.mockResolvedValue({ allowed: true, budgetUsd: null, spentUsd: 0, hasUnknownCost: false })
    usageResult = { data: [], error: null }
  })

  it('returns non-2xx instead of synthetic totals when ai_usage_logs fails', async () => {
    usageResult = { data: null, error: { message: 'relation ai_usage_logs does not exist' } }

    const response = await GET(request())
    const body = await response.json()

    expect(response.ok).toBe(false)
    expect(body).not.toHaveProperty('totals')
  })

  it('keeps a successful empty collection as zero totals', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.totals).toMatchObject({ calls: 0, totalTokens: 0, costUsd: 0 })
  })
})
