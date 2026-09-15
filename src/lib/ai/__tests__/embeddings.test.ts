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
  checkAiBudgetMock,
} = vi.hoisted(() => {
  const redisGetMock = vi.fn()
  const redisSetexMock = vi.fn()
  return {
    getRedisMock: vi.fn(() => ({ get: redisGetMock, setex: redisSetexMock })),
    redisGetMock,
    redisSetexMock,
    trackAiUsageMock: vi.fn(),
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

vi.mock('../cost-tracker', () => ({ trackAiUsage: trackAiUsageMock }))
vi.mock('../budget', () => ({ checkAiBudget: checkAiBudgetMock }))

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

  it('registra custo desconhecido uma vez quando o fetch unitário rejeita', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(generateEmbedding('frete', 'sk-teste', 'org-a')).rejects.toThrow(/network down/)

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

describe('generateEmbeddingsBatch', () => {
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

    const results = await generateEmbeddingsBatch(['a', 'b', 'c'], 'sk-teste')

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
    const results = await generateEmbeddingsBatch(texts, 'sk-teste')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(inputSizes).toEqual([100, 50])
    expect(results).toHaveLength(150)
    // `results[100]` é o PRIMEIRO vetor da SEGUNDA chamada. É esta asserção,
    // e não a ordenação do caso acima, que morre se `results[item.index]`
    // (:224) virar `results[j]`: no segundo lote `j` reinicia em 0.
    expect(results[0]).toEqual([0, 0])
    expect(results[100]).toEqual([1, 0])
  })

  it('deixa a mensagem do provedor atravessar o wrapper de erro', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'insufficient_quota' } }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    // O `catch` de :234-237 reembrulha tudo o que sai do `try`, então a
    // asserção é sobre a mensagem embrulhada — contém, não é igual.
    await expect(generateEmbeddingsBatch(['a'], 'sk-teste')).rejects.toThrow(/insufficient_quota/)
  })
})
