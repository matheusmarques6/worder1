import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickSttKey, transcribeAudio } from '../transcription'

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
  it('POSTa multipart no endpoint do provider e retorna o texto trimado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: ' olá, quero fazer um pedido ' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const text = await transcribeAudio({
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
  })

  it('usa o endpoint da openai para provider openai', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'oi' }) })
    vi.stubGlobal('fetch', fetchMock)
    await transcribeAudio({
      config: { provider: 'openai', apiKey: 'sk_test', model: 'whisper-1' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions')
  })

  it('lanca erro com a mensagem da API quando nao-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: 'invalid api key' } }),
      }),
    )
    await expect(
      transcribeAudio({
        config: { provider: 'openai', apiKey: 'sk', model: 'whisper-1' },
        audio: Buffer.from('x'),
        mimeType: 'audio/ogg',
      }),
    ).rejects.toThrow('invalid api key')
  })

  it('lanca erro legivel quando o corpo de erro nao e JSON (ex.: gateway 502/504)', async () => {
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
        config: { provider: 'openai', apiKey: 'sk', model: 'whisper-1' },
        audio: Buffer.from('x'),
        mimeType: 'audio/ogg',
      }),
    ).rejects.toThrow(/transcription error/)
  })
})
