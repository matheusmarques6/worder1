import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AiBudgetExceededError } from '../../budget'
import { pickSttKey, transcribeAudio } from '../transcription'

const { checkAiBudgetMock, trackAiUsageMock } = vi.hoisted(() => ({
  checkAiBudgetMock: vi.fn(),
  trackAiUsageMock: vi.fn(),
}))

vi.mock('../../budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../budget')>()),
  checkAiBudget: (...args: unknown[]) => checkAiBudgetMock(...args),
}))

vi.mock('../../cost-tracker', () => ({
  trackAiUsage: (...args: unknown[]) => trackAiUsageMock(...args),
}))

beforeEach(() => {
  checkAiBudgetMock.mockReset().mockResolvedValue({
    allowed: true,
    budgetUsd: 50,
    spentUsd: 0,
    hasUnknownCost: false,
  })
  trackAiUsageMock.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pickSttKey', () => {
  it('prefere openai (whisper-1) quando as duas chaves existem', () => {
    const cfg = pickSttKey([
      { provider: 'groq', api_key: 'gsk_test' },
      { provider: 'openai', api_key: 'sk_test' },
    ])
    expect(cfg).toEqual({ provider: 'openai', apiKey: 'sk_test', model: 'whisper-1' })
  })

  it('cai para groq (whisper-large-v3) sem chave openai', () => {
    const cfg = pickSttKey([{ provider: 'groq', api_key: 'gsk_test' }])
    expect(cfg).toEqual({ provider: 'groq', apiKey: 'gsk_test', model: 'whisper-large-v3' })
  })

  it('retorna null sem provider compativel com STT', () => {
    expect(pickSttKey([{ provider: 'anthropic', api_key: 'sk-ant' }])).toBeNull()
    expect(pickSttKey([])).toBeNull()
  })
})

describe('transcribeAudio', () => {
  it('mede 60s do Groq, pede verbose_json e retorna o texto trimado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: ' olá, quero fazer um pedido ', duration: 60 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const text = await transcribeAudio({
      organizationId: 'org-a',
      config: { provider: 'groq', apiKey: 'gsk_test', model: 'whisper-large-v3' },
      audio: Buffer.from('fake-ogg-bytes'),
      mimeType: 'audio/ogg',
    })

    expect(text).toBe('olá, quero fazer um pedido')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer gsk_test')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('model')).toBe('whisper-large-v3')
    expect((init.body as FormData).get('response_format')).toBe('verbose_json')
    expect(checkAiBudgetMock).toHaveBeenCalledWith('org-a', { throwOnExceeded: true })
    expect(checkAiBudgetMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    )
    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith({
      organizationId: 'org-a',
      provider: 'groq',
      model: 'whisper-large-v3',
      feature: 'transcription',
      success: true,
      costUsdOverride: 0.00185,
      metadata: { billable: true },
    })
    const trackerCalls = JSON.stringify(trackAiUsageMock.mock.calls)
    expect(trackerCalls).not.toContain('gsk_test')
    expect(trackerCalls).not.toContain('fake-ogg-bytes')
    expect(trackerCalls).not.toContain('olá, quero fazer um pedido')
  })

  it('aplica o mínimo faturado de 10s do Groq para áudio de 5s', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'oi', duration: 5 }),
    }))

    await transcribeAudio({
      organizationId: 'org-a',
      config: { provider: 'groq', apiKey: 'gsk_test', model: 'whisper-large-v3' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })

    expect(trackAiUsageMock.mock.calls[0][0].costUsdOverride).toBeCloseTo(
      0.0003083333333333333,
      15,
    )
  })

  it('usa o maior fim de segmento quando duration não existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: 'oi',
        segments: [{ end: 3 }, { end: 12 }, { end: -1 }, { end: Number.POSITIVE_INFINITY }],
      }),
    }))

    await transcribeAudio({
      organizationId: 'org-a',
      config: { provider: 'groq', apiKey: 'gsk_test', model: 'whisper-large-v3' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })

    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      costUsdOverride: 0.00037,
    }))
  })

  it('mede um minuto de whisper-1 como USD 0.006', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'oi', duration: 60 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await transcribeAudio({
      organizationId: 'org-a',
      config: { provider: 'openai', apiKey: 'sk_test', model: 'whisper-1' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai',
      model: 'whisper-1',
      costUsdOverride: 0.006,
    }))
  })

  it('registra custo desconhecido quando a resposta não tem duração confiável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'oi', duration: 0, segments: [{ end: Number.NaN }] }),
    }))

    expect(await transcribeAudio({
      organizationId: 'org-a',
      config: { provider: 'openai', apiKey: 'sk', model: 'whisper-1' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })).toBe('oi')

    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      costUsdOverride: null,
      metadata: { billable: true },
    }))
  })

  it('registra uma falha HTTP 502 exatamente uma vez', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
        text: () => Promise.resolve('<html>Bad Gateway</html>'),
      }),
    )
    await expect(
      transcribeAudio({
        organizationId: 'org-a',
        config: { provider: 'openai', apiKey: 'sk', model: 'whisper-1' },
        audio: Buffer.from('x'),
        mimeType: 'audio/ogg',
      }),
    ).rejects.toThrow(/transcription error/)

    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      success: false,
      costUsdOverride: null,
      metadata: { billable: true },
    }))
  })

  it('registra fetch rejeitado uma vez e preserva o mesmo erro', async () => {
    const originalError = new Error('network down')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(originalError))

    await expect(transcribeAudio({
      organizationId: 'org-a',
      config: { provider: 'openai', apiKey: 'sk', model: 'whisper-1' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })).rejects.toBe(originalError)

    expect(trackAiUsageMock).toHaveBeenCalledTimes(1)
    expect(trackAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      costUsdOverride: null,
    }))
  })

  it('bloqueia budget antes do fetch e preserva o erro tipado', async () => {
    const budgetError = new AiBudgetExceededError(50, 50)
    checkAiBudgetMock.mockRejectedValueOnce(budgetError)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeAudio({
      organizationId: 'org-a',
      config: { provider: 'openai', apiKey: 'sk', model: 'whisper-1' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })).rejects.toBe(budgetError)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackAiUsageMock).not.toHaveBeenCalled()
  })

  it('bloqueia combinação provider/model sem preço antes de budget ou fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeAudio({
      organizationId: 'org-a',
      config: { provider: 'openai', apiKey: 'sk', model: 'whisper-large-v3' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })).rejects.toMatchObject({
      name: 'AiBudgetUnavailableError',
      status: 503,
      unknownReason: 'unpriced_model',
    })

    expect(checkAiBudgetMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackAiUsageMock).not.toHaveBeenCalled()
  })

  it('recusa organização vazia antes de budget, fetch ou registro', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeAudio({
      organizationId: '',
      config: { provider: 'openai', apiKey: 'sk', model: 'whisper-1' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })).rejects.toThrow('organizationId não informado')

    expect(checkAiBudgetMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackAiUsageMock).not.toHaveBeenCalled()
  })
})
