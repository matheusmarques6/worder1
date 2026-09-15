// src/lib/ai/__tests__/embeddings.test.ts
// =============================================
// generateEmbeddingsBatch — ordenação, lote e erro do provedor.
//
// Este é o ÚNICO caminho de ingestão de embeddings do hub, e até aqui não
// tinha arquivo de teste nenhum: a única trava que tocava `embeddings.ts` era
// textual (`hub-runtime-parity.test.ts:107-108`, duas regex) e a de
// alcançabilidade (`deletion-set.test.ts:378`). Um erro de ordenação aqui
// grava vetor no chunk errado SEM erro nenhum — a mesma classe de falha
// silenciosa que o comentário `:6-14` do próprio arquivo descreve.
// =============================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateEmbedding, generateEmbeddingsBatch } from '../embeddings'

const {
  getRedisMock,
  redisGetMock,
  redisSetexMock,
  trackAiUsageMock,
  estimateCostUsdMock,
  checkAiBudgetMock,
} = vi.hoisted(() => {
  const redisGetMock = vi.fn()
  const redisSetexMock = vi.fn()
  return {
    getRedisMock: vi.fn(() => ({ get: redisGetMock, setex: redisSetexMock })),
    redisGetMock,
    redisSetexMock,
    trackAiUsageMock: vi.fn(),
    estimateCostUsdMock: vi.fn(),
    checkAiBudgetMock: vi.fn(),
  }
})

// `src/tests/setup.ts:9-14` troca `@/lib/redis` inteiro por um dublê que NÃO
// exporta `CACHE_PREFIX`, `CACHE_TTL` nem `getRedis` — os três que
// `embeddings.ts:18` importa. Sob esse dublê o módulo nem carrega. Aqui vale o
// módulo real, exceto o cliente externo; os exports de constantes continuam
// reais e `vi.stubEnv` abaixo ainda controla `isRedisConfigured()`.
vi.mock('@/lib/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis')>()),
  getRedis: getRedisMock,
}))

vi.mock('../cost-tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cost-tracker')>()
  estimateCostUsdMock.mockImplementation(actual.estimateCostUsd)
  return { ...actual, estimateCostUsd: estimateCostUsdMock, trackAiUsage: trackAiUsageMock }
})
vi.mock('../budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../budget')>()),
  checkAiBudget: checkAiBudgetMock,
}))

// Redis desligado por declaração, não por sorte: `isRedisConfigured()`
// (`src/lib/redis.ts:35`) é só a presença das duas envs, lida em tempo de
// chamada — um dev com Upstash no `.env` veria as branches de cache ligarem e
// estes casos deixariam de exercitar o caminho de geração.
beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  getRedisMock.mockClear()
  redisGetMock.mockReset().mockResolvedValue(null)
  redisSetexMock.mockReset().mockResolvedValue('OK')
  trackAiUsageMock.mockReset().mockResolvedValue(undefined)
  estimateCostUsdMock.mockClear()
  checkAiBudgetMock.mockReset().mockResolvedValue({
    allowed: true,
    budgetUsd: 50,
    spentUsd: 0,
    hasUnknownCost: false,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('generateEmbedding unitário', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token')
  })

  it('registra somente o cache miss mesmo quando outra organização reutiliza o cache', async () => {
    const embedding = Array(1536).fill(0)
    redisGetMock.mockResolvedValueOnce(null).mockResolvedValue(embedding)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding }], usage: { prompt_tokens: 7 } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await generateEmbedding('frete', 'sk-teste', 'org-a')).toEqual(embedding)
    expect(await generateEmbedding('frete', 'sk-teste', 'org-a')).toEqual(embedding)
    expect(await generateEmbedding('frete', 'sk-teste', 'org-b')).toEqual(embedding)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(estimateCostUsdMock).toHaveBeenCalledWith('openai', 'text-embedding-3-small', 1, 0)
    expect(checkAiBudgetMock).toHaveBeenCalledTimes(1)
    expect(checkAiBudgetMock).toHaveBeenCalledWith('org-a', { throwOnExceeded: true })
    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith({
      organizationId: 'org-a',
      provider: 'openai',
      model: 'text-embedding-3-small',
      feature: 'embedding',
      promptTokens: 7,
      completionTokens: 0,
      metadata: { billable: true },
    })
    expect(JSON.stringify(trackAiUsageMock.mock.calls)).not.toContain('sk-teste')
    expect(JSON.stringify(trackAiUsageMock.mock.calls)).not.toContain('frete')
  })

  it('bloqueia modelo unitário sem preço antes de budget, request ou registro', async () => {
    estimateCostUsdMock.mockReturnValueOnce(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateEmbedding('frete', 'sk-teste', 'org-a')).rejects.toMatchObject({
      name: 'AiBudgetUnavailableError',
      status: 503,
      unknownReason: 'unpriced_model',
    })

    expect(checkAiBudgetMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackAiUsageMock).not.toHaveBeenCalled()
  })

  it('registra custo desconhecido uma vez quando o fetch unitário rejeita', async () => {
    const originalError = new Error('network down')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(originalError))

    await expect(generateEmbedding('frete', 'sk-teste', 'org-a')).rejects.toBe(originalError)

    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      feature: 'embedding',
      success: false,
      costUsdOverride: null,
      metadata: { billable: true },
    }))
  })

  it('registra custo desconhecido uma vez quando o HTTP unitário não é OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'insufficient_quota' } }),
    }))

    await expect(generateEmbedding('frete', 'sk-teste', 'org-a')).rejects.toThrow(/insufficient_quota/)

    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      costUsdOverride: null,
      metadata: { billable: true },
    }))
  })

  it('registra custo desconhecido quando o JSON unitário não contém usage', async () => {
    const embedding = Array(1536).fill(1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding }] }),
    }))

    expect(await generateEmbedding('frete', 'sk-teste', 'org-a')).toEqual(embedding)

    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      promptTokens: undefined,
      completionTokens: undefined,
      costUsdOverride: null,
      metadata: { billable: true },
    }))
  })

  it('não duplica o registro unitário quando o cache falha depois do parse', async () => {
    const embedding = Array(1536).fill(2)
    redisSetexMock.mockRejectedValueOnce(new Error('cache refused'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding }], usage: { prompt_tokens: 7 } }),
    }))

    expect(await generateEmbedding('frete', 'sk-teste', 'org-a')).toEqual(embedding)

    expect(redisSetexMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
  })

  it('não emite request nem registro unitário quando o budget bloqueia', async () => {
    const budgetError = new Error('budget blocked')
    checkAiBudgetMock.mockRejectedValueOnce(budgetError)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateEmbedding('frete', 'sk-teste', 'org-a')).rejects.toBe(budgetError)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackAiUsageMock).not.toHaveBeenCalled()
  })

  it('recusa cache miss unitário sem organização antes de budget ou request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateEmbedding('frete', 'sk-teste', '')).rejects.toThrow('organizationId não informado')

    expect(checkAiBudgetMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackAiUsageMock).not.toHaveBeenCalled()
  })
})

describe('generateEmbeddingsBatch lote', () => {
  it('devolve os vetores na ordem dos textos, não na ordem em que o provedor respondeu', async () => {
    // A resposta vem fora de ordem DE PROPÓSITO. Com `data` já ordenado,
    // apagar o `.sort()` de :217 passaria igual e o caso seria decorativo.
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { index: 2, embedding: [2] },
          { index: 0, embedding: [0] },
          { index: 1, embedding: [1] },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const results = await generateEmbeddingsBatch(['a', 'b', 'c'], 'sk-teste', 'org-a')

    expect(results).toEqual([[0], [1], [2]])
  })

  it('quebra em lotes de 100 e devolve cada vetor na posição do texto de ENTRADA', async () => {
    const inputSizes: number[] = []
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const call = inputSizes.length
      const input = (JSON.parse(init.body) as { input: string[] }).input
      inputSizes.push(input.length)
      return {
        ok: true,
        json: async () => ({
          data: input.map((_text, i) => ({ index: i, embedding: [call, i] })),
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const texts = Array.from({ length: 150 }, (_v, i) => `texto ${i}`)
    const results = await generateEmbeddingsBatch(texts, 'sk-teste', 'org-a')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(inputSizes).toEqual([100, 50])
    expect(results).toHaveLength(150)
    // `results[100]` é o PRIMEIRO vetor da SEGUNDA chamada. É esta asserção,
    // e não a ordenação do caso acima, que morre se `results[item.index]`
    // (:224) virar `results[j]`: no segundo lote `j` reinicia em 0.
    expect(results[0]).toEqual([0, 0])
    expect(results[100]).toEqual([1, 0])
  })

  it('deixa a mensagem do provedor atravessar o erro HTTP', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'insufficient_quota' } }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateEmbeddingsBatch(['a'], 'sk-teste', 'org-a')).rejects.toThrow(/insufficient_quota/)
  })

  it('registra uma linha por request no lote de 101 textos, nunca por vetor', async () => {
    const inputSizes: number[] = []
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const call = inputSizes.length
      const input = (JSON.parse(init.body) as { input: string[] }).input
      inputSizes.push(input.length)
      return {
        ok: true,
        json: async () => ({
          data: input.map((_text, index) => ({ index, embedding: [call, index] })),
          usage: { prompt_tokens: call === 0 ? 10 : 2 },
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const texts = Array.from({ length: 101 }, (_value, index) => `texto confidencial ${index}`)
    const results = await generateEmbeddingsBatch(texts, 'sk-teste', 'org-a')

    expect(inputSizes).toEqual([100, 1])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(estimateCostUsdMock).toHaveBeenCalledTimes(2)
    expect(estimateCostUsdMock).toHaveBeenCalledWith('openai', 'text-embedding-3-small', 1, 0)
    expect(checkAiBudgetMock).toHaveBeenCalledTimes(2)
    expect(checkAiBudgetMock).toHaveBeenNthCalledWith(1, 'org-a', { throwOnExceeded: true })
    expect(checkAiBudgetMock).toHaveBeenNthCalledWith(2, 'org-a', { throwOnExceeded: true })
    expect(trackAiUsageMock).toHaveBeenCalledTimes(2)
    expect(trackAiUsageMock.mock.calls.map(([usage]) => usage.promptTokens)).toEqual([10, 2])
    for (const [usage] of trackAiUsageMock.mock.calls) {
      expect(usage).toMatchObject({
        organizationId: 'org-a',
        provider: 'openai',
        model: 'text-embedding-3-small',
        feature: 'embedding',
        completionTokens: 0,
        metadata: { billable: true },
      })
    }
    expect(results[0]).toEqual([0, 0])
    expect(results[100]).toEqual([1, 0])
    expect(JSON.stringify(trackAiUsageMock.mock.calls)).not.toContain('sk-teste')
    expect(JSON.stringify(trackAiUsageMock.mock.calls)).not.toContain('texto confidencial')
  })

  it('não consulta preço, budget, provedor ou tracker quando o lote está todo no cache', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token')
    const embedding = Array(1536).fill(3)
    redisGetMock.mockResolvedValue(embedding)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await generateEmbeddingsBatch(['a', 'b'], 'sk-teste', 'org-a')).toEqual([
      embedding,
      embedding,
    ])

    expect(estimateCostUsdMock).not.toHaveBeenCalled()
    expect(checkAiBudgetMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackAiUsageMock).not.toHaveBeenCalled()
  })

  it('preserva o sucesso do primeiro request e o mesmo erro de rede do segundo', async () => {
    const originalError = new Error('network down')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 100 }, (_value, index) => ({ index, embedding: [index] })),
          usage: { prompt_tokens: 10 },
        }),
      })
      .mockRejectedValueOnce(originalError)
    vi.stubGlobal('fetch', fetchMock)

    const texts = Array.from({ length: 101 }, (_value, index) => `texto ${index}`)
    await expect(generateEmbeddingsBatch(texts, 'sk-teste', 'org-a')).rejects.toBe(originalError)

    expect(trackAiUsageMock).toHaveBeenCalledTimes(2)
    expect(trackAiUsageMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      organizationId: 'org-a',
      promptTokens: 10,
      completionTokens: 0,
      metadata: { billable: true },
    }))
    expect(trackAiUsageMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      organizationId: 'org-a',
      success: false,
      costUsdOverride: null,
      metadata: { billable: true },
    }))
  })

  it('preserva o sucesso do primeiro request e registra uma falha HTTP no segundo', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 100 }, (_value, index) => ({ index, embedding: [index] })),
          usage: { prompt_tokens: 10 },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'insufficient_quota' } }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const texts = Array.from({ length: 101 }, (_value, index) => `texto ${index}`)
    await expect(generateEmbeddingsBatch(texts, 'sk-teste', 'org-a')).rejects.toThrow(/insufficient_quota/)

    expect(trackAiUsageMock).toHaveBeenCalledTimes(2)
    expect(trackAiUsageMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      promptTokens: 10,
      completionTokens: 0,
    }))
    expect(trackAiUsageMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      success: false,
      costUsdOverride: null,
    }))
  })

  it('registra uma única linha de custo desconhecido quando usage não vem no lote', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ index: 0, embedding: [1] }] }),
    }))

    expect(await generateEmbeddingsBatch(['a'], 'sk-teste', 'org-a')).toEqual([[1]])

    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      promptTokens: undefined,
      completionTokens: undefined,
      costUsdOverride: null,
      metadata: { billable: true },
    }))
  })

  it('não duplica nem perde vetores quando o cache falha depois do parse do lote', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token')
    redisSetexMock.mockRejectedValue(new Error('cache refused'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [1] },
          { index: 1, embedding: [2] },
        ],
        usage: { prompt_tokens: 7 },
      }),
    }))

    expect(await generateEmbeddingsBatch(['a', 'b'], 'sk-teste', 'org-a')).toEqual([[1], [2]])

    expect(redisSetexMock).toHaveBeenCalledTimes(2)
    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
  })

  it('bloqueia preço desconhecido antes de budget, fetch ou registro do lote', async () => {
    estimateCostUsdMock.mockReturnValueOnce(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateEmbeddingsBatch(['a'], 'sk-teste', 'org-a')).rejects.toMatchObject({
      name: 'AiBudgetUnavailableError',
      status: 503,
      unknownReason: 'unpriced_model',
    })

    expect(checkAiBudgetMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackAiUsageMock).not.toHaveBeenCalled()
  })

  it('mantém o primeiro request contabilizado quando o budget bloqueia o segundo lote', async () => {
    const budgetError = new Error('budget blocked')
    checkAiBudgetMock.mockResolvedValueOnce({
      allowed: true,
      budgetUsd: 50,
      spentUsd: 0,
      hasUnknownCost: false,
    }).mockRejectedValueOnce(budgetError)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: Array.from({ length: 100 }, (_value, index) => ({ index, embedding: [index] })),
        usage: { prompt_tokens: 10 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const texts = Array.from({ length: 101 }, (_value, index) => `texto ${index}`)
    await expect(generateEmbeddingsBatch(texts, 'sk-teste', 'org-a')).rejects.toBe(budgetError)

    expect(checkAiBudgetMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      promptTokens: 10,
      completionTokens: 0,
    }))
  })
})
