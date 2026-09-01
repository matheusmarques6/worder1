// src/lib/ai/__tests__/ssrf-guard.test.ts
// =============================================
// ssrf-guard.ts — item 18 do audit: portão de rede do crawler.
// DNS mockado (node:dns/promises), fetch mockado. Nenhuma rede real.
// =============================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

import { lookup } from 'node:dns/promises'
import { assertSafeUrl, safeFetch, isPrivateOrReservedIp } from '../ssrf-guard'

const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

describe('isPrivateOrReservedIp', () => {
  it.each([
    ['169.254.169.254', true], // link-local IPv4 — metadata cloud (AWS/GCP)
    ['127.0.0.1', true], // loopback
    ['10.0.0.5', true], // privada 10/8
    ['172.16.0.5', true], // privada 172.16/12
    ['192.168.1.1', true], // privada 192.168/16
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['93.184.216.34', false],
    ['::1', true], // loopback IPv6
    ['fe80::1', true], // link-local IPv6
    ['fc00::1', true], // unique-local IPv6 (equivalente a privada)
    ['::ffff:127.0.0.1', true], // IPv4-mapped em IPv6 — loopback
    ['::ffff:169.254.169.254', true], // IPv4-mapped — metadata cloud
    ['::ffff:8.8.8.8', false], // IPv4-mapped mas público
    ['2001:4860:4860::8888', false], // público (Google DNS IPv6)
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateOrReservedIp(ip as string)).toBe(expected)
  })
})

describe('assertSafeUrl', () => {
  beforeEach(() => { mockLookup.mockReset() })

  it('recusa esquema file://', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(/não pode ser usado como fonte/)
  })

  it('recusa esquema gopher://', async () => {
    await expect(assertSafeUrl('gopher://example.com/x')).rejects.toThrow(/não pode ser usado como fonte/)
  })

  it('recusa URL com credenciais embutidas', async () => {
    await expect(assertSafeUrl('http://user:pass@example.com/')).rejects.toThrow(/não pode ser usado como fonte/)
  })

  it('recusa IP link-local literal (169.254.169.254 — metadata cloud)', async () => {
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /não pode ser usado como fonte/
    )
    expect(mockLookup).not.toHaveBeenCalled() // IP literal não precisa resolver
  })

  it('recusa IPv6 loopback literal ([::1])', async () => {
    await expect(assertSafeUrl('http://[::1]:3000/')).rejects.toThrow(/não pode ser usado como fonte/)
  })

  it('recusa localhost (resolve para loopback)', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    await expect(assertSafeUrl('http://localhost:3000')).rejects.toThrow(/não pode ser usado como fonte/)
  })

  it('recusa host que resolve para rede privada (DNS interno)', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    await expect(assertSafeUrl('http://interno.corp/')).rejects.toThrow(/não pode ser usado como fonte/)
  })

  it('recusa quando falha ao resolver o host', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'))
    await expect(assertSafeUrl('https://naoexiste.invalid/')).rejects.toThrow(/não pode ser usado como fonte/)
  })

  it('aceita host público normal e devolve a URL', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const url = await assertSafeUrl('https://loja.com/produtos')
    expect(url.hostname).toBe('loja.com')
  })
})

describe('safeFetch', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    mockLookup.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('busca normalmente quando o host é público', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    const res = await safeFetch('https://loja.com/')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith('https://loja.com/', expect.objectContaining({ redirect: 'manual' }))
  })

  it('segue redirect para outro host público, verificando o destino', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://outraloja.com/' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const res = await safeFetch('https://loja.com/')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('recusa quando o redirect aponta para IP interno — verificado NO SALTO', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
    )
    await expect(safeFetch('https://loja.com/')).rejects.toThrow(/não pode ser usado como fonte/)
    // o segundo salto (o host malicioso) nunca chegou a ser buscado
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('recusa após excesso de redirecionamentos', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://loja.com/loop' } }))
    await expect(safeFetch('https://loja.com/', {}, 2)).rejects.toThrow(/não pode ser usado como fonte/)
  })
})
