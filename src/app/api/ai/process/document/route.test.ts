import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AiBudgetExceededError, AiBudgetUnavailableError } from '@/lib/ai/budget'

const mockGetSupabaseAdmin = vi.fn()
const mockCheckAiBudget = vi.fn()
const mockGenerateEmbeddingsBatch = vi.fn()
const mockResolveEmbeddingKey = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}))

vi.mock('@/lib/ai/budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/budget')>()),
  checkAiBudget: (...args: any[]) => mockCheckAiBudget(...args),
}))

vi.mock('@/lib/ai/embeddings', () => ({
  EMBEDDING_SPACE: 'openai:text-embedding-3-small',
  generateEmbeddingsBatch: (...args: any[]) => mockGenerateEmbeddingsBatch(...args),
}))

vi.mock('@/lib/ai/embedding-key', () => ({
  resolveEmbeddingKey: (...args: any[]) => mockResolveEmbeddingKey(...args),
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
    mockGenerateEmbeddingsBatch.mockReset()
    mockResolveEmbeddingKey.mockReset()
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

  it('returns 503 for lookup_error when the configured budget is zero', async () => {
    mockCheckAiBudget.mockResolvedValue({
      allowed: false,
      budgetUsd: 0,
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

  it('keeps 402 when known spend is exhausted even with unpriced usage', async () => {
    mockCheckAiBudget.mockResolvedValue({
      allowed: false,
      budgetUsd: 50,
      spentUsd: 50,
      hasUnknownCost: true,
      unknownReason: 'unpriced_model',
    })

    const response = await POST(request({ authorization: 'Bearer internal-secret' }))
    const body = await response.json()

    expect(response.status).toBe(402)
    expect(body.code).toBe('AI_BUDGET_EXCEEDED')
    expect(body).not.toHaveProperty('unknownReason')
  })

  it.each([
    {
      name: 'budget tipado excedido',
      error: new AiBudgetExceededError(50, 50),
      status: 402,
      code: 'AI_BUDGET_EXCEEDED',
    },
    {
      name: 'budget tipado indisponível',
      error: new AiBudgetUnavailableError('unpriced_model'),
      status: 503,
      code: 'AI_BUDGET_UNAVAILABLE',
      unknownReason: 'unpriced_model',
    },
  ])('preserva status e código do $name lançado pelo batch', async ({ error, status, code, unknownReason }) => {
    const sourceUpdates: any[] = []
    const supabase = {
      from: vi.fn((table: string) => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'source-1',
              organization_id: 'org-1',
              agent_id: 'agent-1',
              source_type: 'text',
              text_content: 'Conteúdo da fonte',
              name: 'Fonte',
            },
            error: null,
          }),
          update: vi.fn((payload: any) => {
            if (table === 'ai_agent_sources') sourceUpdates.push(payload)
            return chain
          }),
          then: (resolve: (value: unknown) => void) =>
            Promise.resolve({ data: null, error: null }).then(resolve),
        }
        return chain
      }),
    }
    mockGetSupabaseAdmin.mockReturnValue(supabase)
    mockCheckAiBudget.mockResolvedValue({
      allowed: true,
      budgetUsd: 50,
      spentUsd: 0,
      hasUnknownCost: false,
    })
    mockResolveEmbeddingKey.mockResolvedValue('sk-teste')
    mockGenerateEmbeddingsBatch.mockRejectedValue(error)

    const response = await POST(request({ authorization: 'Bearer internal-secret' }))
    const body = await response.json()

    expect(response.status).toBe(status)
    expect(body).toMatchObject({ code, ...(unknownReason ? { unknownReason } : {}) })
    if (!unknownReason) expect(body).not.toHaveProperty('unknownReason')
    expect(sourceUpdates).toContainEqual(expect.objectContaining({ status: 'error' }))
  })
})
