import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// Storage sempre falha nestes testes — exercitamos o fallback por URL.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({ data: null, error: { message: 'not found' } })),
      })),
    },
  },
}))

// item 19 do audit: media_url vem do PROVEDOR (WhatsApp), não do lojista, mas
// fetchInboundMedia agora passa por safeFetch (ssrf-guard.ts) — que resolve o
// host antes de buscar. Mock de DNS igual ao de crawler.test.ts: hostnames
// destes testes são todos "públicos" pro portão, exceto onde o teste do
// próprio portão troca a resolução de propósito.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

import { lookup } from 'node:dns/promises'
import { fetchInboundMedia, MAX_INBOUND_MEDIA_BYTES } from '../fetch-media'

const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockLookup.mockReset()
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function fetchResponse(bytes: Uint8Array, contentType = 'image/jpeg') {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => bytes.buffer,
  }
}

describe('fetchInboundMedia', () => {
  it('sem ponteiros retorna null', async () => {
    expect(await fetchInboundMedia({})).toBeNull()
  })

  it('baixa por media_url quando storage falha e usa content-type da resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(new Uint8Array([1, 2, 3]))))
    const media = await fetchInboundMedia({
      storagePath: 'org/conv/x.jpg',
      mediaUrl: 'https://cdn.example.com/x.jpg',
      mimeType: null,
    })
    expect(media?.buffer).toEqual(Buffer.from([1, 2, 3]))
    expect(media?.mimeType).toBe('image/jpeg')
  })

  it('mimeType explicito da row tem prioridade sobre o content-type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(new Uint8Array([1]))))
    const media = await fetchInboundMedia({
      mediaUrl: 'https://cdn.example.com/a.ogg',
      mimeType: 'audio/ogg',
    })
    expect(media?.mimeType).toBe('audio/ogg')
  })

  it('resposta nao-ok retorna null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, headers: new Headers() }),
    )
    expect(await fetchInboundMedia({ mediaUrl: 'https://cdn.example.com/x.jpg' })).toBeNull()
  })

  it('midia acima do cap retorna null', async () => {
    const big = new Uint8Array(MAX_INBOUND_MEDIA_BYTES + 1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(big)))
    expect(await fetchInboundMedia({ mediaUrl: 'https://cdn.example.com/big.jpg' })).toBeNull()
  })

  // item 19 do audit: media_url vem do provedor sem portão nenhum — mesma
  // classe de SSRF do item 18 (crawler) e do item 19 (custom tools test
  // route), só que aqui o "provedor" que manda a URL pode ser forjado (um
  // webhook de mídia com media_url apontando pra rede interna).
  describe('SSRF — item 19 do audit', () => {
    it('media_url IP literal privado (metadata da nuvem) é recusada sem chamar fetch', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse(new Uint8Array([1])))
      vi.stubGlobal('fetch', fetchMock)

      const media = await fetchInboundMedia({
        mediaUrl: 'http://169.254.169.254/latest/meta-data/',
      })

      expect(media).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('media_url com hostname que resolve para IP privado é recusada sem chamar fetch', async () => {
      mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse(new Uint8Array([1])))
      vi.stubGlobal('fetch', fetchMock)

      const media = await fetchInboundMedia({ mediaUrl: 'https://interno.exemplo.com/x.jpg' })

      expect(media).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fix round 1 (review): a recusa do guard fica logada — não é indistinguível de um 404 na ops', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse(new Uint8Array([1])))
      vi.stubGlobal('fetch', fetchMock)

      const media = await fetchInboundMedia({
        mediaUrl: 'http://169.254.169.254/latest/meta-data/',
      })

      expect(media).toBeNull()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0].join(' ')).toContain('não pode ser usado como fonte')
      warnSpy.mockRestore()
    })

    // Redirect-por-salto NÃO tem teste dedicado aqui: fetchInboundMedia
    // reduz toda falha (não-ok, acima do cap, host recusado) ao mesmo
    // `null` — um teste que só olhasse esse retorno não discriminaria "o
    // guard recusou o salto" de "a resposta não era ok", então seria
    // decorativo (passaria igual antes e depois do fix). O mecanismo em si
    // — assertSafeUrl revalidado a cada Location, sem seguir automático —
    // já tem suíte própria e exaustiva em ssrf-guard.test.ts; aqui a
    // integração relevante é só "fetchInboundMedia chama safeFetch", que os
    // dois testes acima já provam (iam buscar de verdade sem o guard).
  })
})
