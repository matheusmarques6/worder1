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

import { fetchInboundMedia, MAX_INBOUND_MEDIA_BYTES } from '../fetch-media'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fetchResponse(bytes: Uint8Array, contentType = 'image/jpeg') {
  return {
    ok: true,
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await fetchInboundMedia({ mediaUrl: 'https://cdn.example.com/x.jpg' })).toBeNull()
  })

  it('midia acima do cap retorna null', async () => {
    const big = new Uint8Array(MAX_INBOUND_MEDIA_BYTES + 1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(big)))
    expect(await fetchInboundMedia({ mediaUrl: 'https://cdn.example.com/big.jpg' })).toBeNull()
  })
})
