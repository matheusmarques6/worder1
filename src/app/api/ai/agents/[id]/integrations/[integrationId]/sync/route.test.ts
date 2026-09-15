import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AiBudgetExceededError, AiBudgetUnavailableError } from '@/lib/ai/budget'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  resolveEmbeddingKey: vi.fn(),
  generateEmbeddingsBatch: vi.fn(),
}))

vi.mock('@/lib/api-utils', () => ({
  getAuthClient: () => mocks.auth(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}))

vi.mock('@/lib/ai/embedding-key', () => ({
  resolveEmbeddingKey: (...args: unknown[]) => mocks.resolveEmbeddingKey(...args),
}))

vi.mock('@/lib/ai/embeddings', () => ({
  EMBEDDING_SPACE: 'openai:text-embedding-3-small',
  generateEmbeddingsBatch: (...args: unknown[]) => mocks.generateEmbeddingsBatch(...args),
}))

import { POST } from './route'

const request = () => new NextRequest(
  'http://localhost/api/ai/agents/agent-1/integrations/integration-1/sync',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  },
)

const context = { params: { id: 'agent-1', integrationId: 'integration-1' } }

function syncSupabase() {
  const integrationUpdates: Array<{ payload: any; scopes: Array<[string, unknown]> }> = []
  const deleteChunks = vi.fn()
  const insertChunks = vi.fn()

  const from = vi.fn((table: string) => {
    let updateRecord: { payload: any; scopes: Array<[string, unknown]> } | null = null
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((field: string, value: unknown) => {
        updateRecord?.scopes.push([field, value])
        return chain
      }),
      single: vi.fn().mockResolvedValue({
        data: table === 'ai_agent_integrations'
          ? {
              id: 'integration-1',
              source_id: 'source-1',
              integration_type: 'shopify',
              allow_price_info: false,
              allow_stock_info: false,
            }
          : null,
        error: null,
      }),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: 'product-1', title: 'Produto 1', description: 'Descrição' }],
        error: null,
      }),
      update: vi.fn((payload: any) => {
        updateRecord = { payload, scopes: [] }
        if (table === 'ai_agent_integrations') integrationUpdates.push(updateRecord)
        return chain
      }),
      insert: vi.fn((payload: any) => {
        if (table === 'ai_agent_chunks') insertChunks(payload)
        return chain
      }),
      delete: vi.fn(() => {
        if (table === 'ai_agent_chunks') deleteChunks()
        return chain
      }),
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    }
    return chain
  })

  return {
    supabase: { from },
    integrationUpdates,
    deleteChunks,
    insertChunks,
  }
}

describe('integration sync preserves indexed data and budget errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.auth.mockResolvedValue({ user: { id: 'user-1', organization_id: 'org-1' } })
    mocks.resolveEmbeddingKey.mockResolvedValue('sk-teste')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    {
      name: 'budget tipado excedido',
      error: new AiBudgetExceededError(50, 50),
      status: 402,
      code: 'AI_BUDGET_EXCEEDED',
      syncError: 'Orçamento de IA excedido',
    },
    {
      name: 'budget tipado indisponível',
      error: new AiBudgetUnavailableError('unpriced_model'),
      status: 503,
      code: 'AI_BUDGET_UNAVAILABLE',
      unknownReason: 'unpriced_model',
      syncError: 'Orçamento de IA indisponível',
    },
  ])('mantém chunks e marca error para $name', async ({ error, status, code, unknownReason, syncError }) => {
    const db = syncSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(db.supabase)
    mocks.generateEmbeddingsBatch.mockRejectedValue(error)

    const response = await POST(request(), context)
    const body = await response.json()

    expect(response.status).toBe(status)
    expect(body).toMatchObject({ code, ...(unknownReason ? { unknownReason } : {}) })
    if (!unknownReason) expect(body).not.toHaveProperty('unknownReason')
    expect(db.deleteChunks).not.toHaveBeenCalled()
    const errorUpdate = db.integrationUpdates.find(({ payload }) => payload.sync_status === 'error')
    expect(errorUpdate).toEqual({
      payload: {
        sync_status: 'error',
        sync_error: syncError,
        updated_at: expect.any(String),
      },
      scopes: [
        ['id', 'integration-1'],
        ['organization_id', 'org-1'],
      ],
    })
  })

  it('preserva chunks até a geração completa resolver e só então os substitui', async () => {
    const db = syncSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(db.supabase)
    let resolveEmbeddings!: (embeddings: number[][]) => void
    mocks.generateEmbeddingsBatch.mockReturnValue(new Promise((resolve) => {
      resolveEmbeddings = resolve
    }))

    const responsePromise = POST(request(), context)
    await vi.waitFor(() => expect(mocks.generateEmbeddingsBatch).toHaveBeenCalledTimes(1))
    expect(db.deleteChunks).not.toHaveBeenCalled()

    resolveEmbeddings([[0]])
    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(db.deleteChunks).toHaveBeenCalledTimes(1)
    expect(db.insertChunks).toHaveBeenCalledTimes(1)
  })
})
