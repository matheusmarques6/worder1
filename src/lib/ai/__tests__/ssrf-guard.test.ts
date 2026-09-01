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
    // fix round 1 — faixas que passavam direto
    ['64:ff9b::a9fe:a9fe', true], // NAT64: gateway traduz pro IPv4 embutido (aqui, 169.254.169.254)
    ['2002:0101:0101::1', true], // 6to4
    ['::7f00:1', true], // IPv4-compatível (deprecated) em forma HEX — new URL() normaliza ::127.0.0.1 pra isto
    ['::a9fe:a9fe', true], // IPv4-compatível de 169.254.169.254, forma hex
    ['::808:808', false], // IPv4-compatível de 8.8.8.8 — público, não deve bloquear
    ['100.64.0.1', true], // CGNAT — onde internals de VPC de nuvem vivem
    ['255.255.255.255', true], // broadcast
    ['224.0.0.1', true], // multicast
    ['240.0.0.1', true], // reservado
    ['192.0.0.1', true], // atribuição de protocolo IETF
    ['198.18.0.1', true], // benchmarking
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

  it('recusa NAT64 apontando pro metadata endpoint via gateway de tradução', async () => {
    await expect(assertSafeUrl('http://[64:ff9b::a9fe:a9fe]/latest/meta-data/')).rejects.toThrow(
      /não pode ser usado como fonte/
    )
    expect(mockLookup).not.toHaveBeenCalled() // IP literal não precisa resolver
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

  it('recusa quando SÓ UM dos múltiplos registros A resolvidos é interno', async () => {
    // host com round-robin DNS: um IP público, um interno — qualquer um dos
    // dois pode ser o que o socket real usa, então basta um ser privado.
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.9', family: 4 },
    ])
    await expect(safeFetch('https://loja.com/')).rejects.toThrow(/não pode ser usado como fonte/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('segue Location relativo do redirect resolvendo contra a URL atual', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/nova-pagina' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const res = await safeFetch('https://loja.com/antiga')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://loja.com/nova-pagina', expect.anything())
  })

  it('chamador não consegue sobrescrever redirect:"follow" via init', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    await safeFetch('https://loja.com/', { redirect: 'follow' } as RequestInit)
    // se o "follow" do chamador vazasse pro fetch real, o guard perderia a
    // visão de cada salto — o portão sempre força 'manual'.
    expect(fetchMock).toHaveBeenCalledWith('https://loja.com/', expect.objectContaining({ redirect: 'manual' }))
  })

  // Fix round 2 (review): fetch nativo com redirect:'follow' remove
  // Authorization num salto cross-origin (WHATWG fetch spec) — nosso loop
  // manual não fazia isso, e até agora nenhum chamador passava credencial
  // (item 19 mudou isso: cloud-api.ts/meta-api.ts levam o Bearer token do
  // WhatsApp). Sem esta checagem, o caminho FELIZ de produção (Meta
  // redireciona a mídia pra um CDN de outra origem) entrega o token da loja
  // pro host que o redirect nomear.
  describe('credenciais não atravessam salto cross-origin (fix round 2)', () => {
    it('remove Authorization/Cookie/Proxy-Authorization no salto pra origem diferente', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://outracdn.com/x' } })
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      await safeFetch('https://cdn.loja.com/x', {
        headers: {
          Authorization: 'Bearer segredo-da-loja',
          Cookie: 'sid=1',
          'Proxy-Authorization': 'Basic xyz',
        },
      })

      const segundoInit = fetchMock.mock.calls[1][1]
      const headers = new Headers(segundoInit.headers)
      expect(headers.get('authorization')).toBeNull()
      expect(headers.get('cookie')).toBeNull()
      expect(headers.get('proxy-authorization')).toBeNull()
    })

    it('mantém Authorization num salto pra MESMA origem', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://cdn.loja.com/y' } })
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      await safeFetch('https://cdn.loja.com/x', {
        headers: { Authorization: 'Bearer segredo-da-loja' },
      })

      const segundoInit = fetchMock.mock.calls[1][1]
      const headers = new Headers(segundoInit.headers)
      expect(headers.get('authorization')).toBe('Bearer segredo-da-loja')
    })

    it('sem blockHttpsDowngrade (default, comportamento dos outros chamadores): segue salto https → http normalmente', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'http://outracdn.com/x' } }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      const res = await safeFetch('https://cdn.loja.com/x')
      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('cadeia de dois saltos: mantém na origem igual, derruba na diferente', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://cdn.loja.com/y' } }) // mesma origem
        )
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://outracdn.com/z' } }) // origem diferente
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      await safeFetch('https://cdn.loja.com/x', {
        headers: { Authorization: 'Bearer segredo-da-loja' },
      })

      expect(new Headers(fetchMock.mock.calls[1][1].headers).get('authorization')).toBe(
        'Bearer segredo-da-loja'
      )
      expect(new Headers(fetchMock.mock.calls[2][1].headers).get('authorization')).toBeNull()
    })
  })

  // Re-review de cdeba429: seguir redirect (fix round 2 do item 19, reusado
  // pela entrega de webhook) abre um jeito de um destino https responder 302
  // pra um http:// arbitrário — o request do segundo salto (corpo + headers,
  // incluindo qualquer segredo neles) vai em texto claro. Opt-in por
  // chamador: o crawler busca http:// de propósito, então o default
  // (blockHttpsDowngrade=false, suíte acima) não pode mudar pra ele.
  describe('blockHttpsDowngrade (opt-in, fix da re-review de cdeba429)', () => {
    it('recusa salto https → http, nunca busca o destino em texto claro', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'http://outracdn.com/x' } }),
      )
      await expect(safeFetch('https://cdn.loja.com/x', {}, 5, true)).rejects.toThrow(
        /não pode ser usado como fonte|não é permitido/,
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('permite salto https → https normalmente', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://outracdn.com/x' } }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      const res = await safeFetch('https://cdn.loja.com/x', {}, 5, true)
      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
