// src/lib/whatsapp/meta-api-download-media.test.ts
// =============================================
// Mesmo achado de cloud-api-download-media.test.ts (fix round 1, item 19):
// downloadMedia (função standalone deste arquivo) busca uma URL lida do
// corpo JSON da Graph API, levando o Bearer token — mesma classe de SSRF,
// mesmo risco de exfiltração de token.
// =============================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

import { lookup } from 'node:dns/promises'
import { downloadMedia } from './meta-api'

const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockLookup.mockReset()
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function graphMediaInfoResponse(url: string) {
  return new Response(JSON.stringify({ url, mime_type: 'image/jpeg' }), { status: 200 })
}

describe('downloadMedia (meta-api.ts) — SSRF (fix round 1)', () => {
  it('url IP literal privado (metadata da nuvem) é recusada sem buscar', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(
      graphMediaInfoResponse('http://169.254.169.254/latest/meta-data/'),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      downloadMedia({ mediaId: 'media-1', accessToken: 'token-secreto' }),
    ).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('url com hostname que resolve para IP privado é recusada', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(graphMediaInfoResponse('https://cdn-interno.exemplo.com/x.jpg'))
    vi.stubGlobal('fetch', fetchMock)
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    await expect(
      downloadMedia({ mediaId: 'media-1', accessToken: 'token-secreto' }),
    ).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('url pública de verdade continua funcionando e leva o Bearer token', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(graphMediaInfoResponse('https://cdn.fbcdn.net/x.jpg'))
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await downloadMedia({ mediaId: 'media-1', accessToken: 'token-secreto' })

    expect(result).toContain('data:image/jpeg;base64,')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const mediaCallInit = fetchMock.mock.calls[1][1]
    expect(mediaCallInit.headers.Authorization).toBe('Bearer token-secreto')
  })
})
