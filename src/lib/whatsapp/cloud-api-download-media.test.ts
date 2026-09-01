// src/lib/whatsapp/cloud-api-download-media.test.ts
// =============================================
// Fix round 1 (review do item 19 do audit) — IMPORTANT 2: downloadMedia
// busca `mediaInfo.url`, uma URL lida do CORPO JSON de uma resposta da
// Graph API (getMediaUrl) — mesma classe de SSRF de fetch-media.ts e da
// rota de teste de custom tool: URL construída a partir de conteúdo
// buscado, não da entrada do lojista. Aqui o risco é maior: a chamada leva
// o Bearer token da conta (Authorization) — um provedor comprometido, ou
// uma resposta forjada, não é só uma leitura interna, é exfiltração do
// token pra um host à escolha do atacante.
//
// Nada aqui toca rede real: fetch e node:dns/promises são mockados.
// =============================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { lookup } from 'node:dns/promises'
import { createWhatsAppCloudClient } from './cloud-api'

const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockLookup.mockReset()
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function client() {
  return createWhatsAppCloudClient({ phoneNumberId: 'pn-1', accessToken: 'token-secreto' })
}

function graphMediaInfoResponse(url: string) {
  return new Response(
    JSON.stringify({ url, mime_type: 'image/jpeg', sha256: 'x', file_size: 3 }),
    { status: 200 },
  )
}

describe('WhatsAppCloudAPI.downloadMedia — SSRF (fix round 1)', () => {
  it('media_url IP literal privado (metadata da nuvem) é recusada sem buscar, token não vaza', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(
      graphMediaInfoResponse('http://169.254.169.254/latest/meta-data/'),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(client().downloadMedia('media-1')).rejects.toThrow()
    // só a chamada pra Graph API (getMediaUrl) aconteceu — a de mídia nunca
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('media_url com hostname que resolve para IP privado é recusada', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(graphMediaInfoResponse('https://cdn-interno.exemplo.com/x.jpg'))
    vi.stubGlobal('fetch', fetchMock)
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    await expect(client().downloadMedia('media-1')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('media_url pública de verdade continua funcionando e leva o Bearer token', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(graphMediaInfoResponse('https://cdn.fbcdn.net/x.jpg'))
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await client().downloadMedia('media-1')

    expect(result.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const mediaCallInit = fetchMock.mock.calls[1][1]
    expect(mediaCallInit.headers.Authorization).toBe('Bearer token-secreto')
  })

  // Fix round 2 (review): o caminho FELIZ de produção é a Meta redirecionar
  // a mídia pra um CDN de outra origem — sem o fix, o token vazava exatamente
  // aqui, não só num ataque. Prova ponta a ponta com o encadeamento real do
  // método: Graph API → media_url → redirect cross-origin → CDN final.
  it('media_url redireciona pra CDN de outra origem: token não vaza no salto, download continua funcionando', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(graphMediaInfoResponse('https://cdn.fbcdn.net/x.jpg'))
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://outro-cdn.exemplo.net/x.jpg' } }),
    )
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await client().downloadMedia('media-1')

    expect(result.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // salto 1 (cdn.fbcdn.net → mesma origem da chamada inicial): token presente
    const firstHopInit = fetchMock.mock.calls[1][1]
    expect(new Headers(firstHopInit.headers).get('authorization')).toBe('Bearer token-secreto')
    // salto 2 (redirect pra outro-cdn.exemplo.net → origem diferente): token cai
    const secondHopInit = fetchMock.mock.calls[2][1]
    expect(new Headers(secondHopInit.headers).get('authorization')).toBeNull()
  })
})
