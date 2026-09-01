import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---- Mocks (hoisted) ----
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
import { lookup } from 'node:dns/promises'
const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

vi.mock('@/lib/webhooks/secret-store', () => ({
  decryptSecret: vi.fn(() => 'segredo-de-teste'),
}))
vi.mock('@/lib/webhooks/signature', () => ({
  buildSignatureHeader: vi.fn(() => 'sha256=deadbeef'),
}))
vi.mock('@/lib/webhooks/bytea', () => ({
  byteaToBuffer: vi.fn(() => Buffer.from('x')),
}))

// Chain thenable (convenção de id-route.test.ts) — from().select().eq().single()
// e from().update().eq() compartilham o mesmo resultado mockado.
let chainResult: any = {}
let rpcResult: any = {}
const calls: Record<string, any[][]> = {}
function resetChain() {
  chainResult = {}
  rpcResult = {}
  for (const k of Object.keys(calls)) delete calls[k]
}
function track(name: string, args: any[]) {
  calls[name] = calls[name] || []
  calls[name].push(args)
}
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: any) => resolve(chainResult)
      return (...args: any[]) => {
        track(prop, args)
        return chain
      }
    },
  },
)

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => (track('rpc', args), rpcResult),
    from: (...args: any[]) => (track('from', args), chain),
  },
}))

import { POST } from '../route'

function req(body: any): any {
  return {
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'x-internal-request': 'true' }),
  }
}

const subRow = {
  secret_encrypted: 'enc',
  secret_previous_encrypted: null,
  secret_previous_expires_at: null,
}

function claimedRow(url: string) {
  return {
    id: 'deliv-1',
    subscription_id: 'sub-1',
    url,
    payload: { foo: 1 },
    event_type: 'order.created',
    event_id: 'evt-1',
    attempt_count: 1,
    max_attempts: 5,
  }
}

const fetchMock = vi.fn()

describe('POST /api/workers/webhook-delivery', () => {
  beforeEach(() => {
    resetChain()
    mockLookup.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.QSTASH_CURRENT_SIGNING_KEY
    delete process.env.QSTASH_NEXT_SIGNING_KEY
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('SSRF: URL do lojista apontando para rede interna', () => {
    it('recusa IPv4 privado literal (10.0.0.5) — não entrega e não captura response body', async () => {
      rpcResult = { data: [claimedRow('https://10.0.0.5:8443/x')], error: null }
      chainResult = { data: subRow, error: null }

      const res = await POST(req({ deliveryId: 'deliv-1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(false)
      expect(body.error).toMatch(/não pode ser usado como fonte/)

      expect(fetchMock).not.toHaveBeenCalled()
      const updatePatch = calls['update']?.[0]?.[0]
      expect(updatePatch).toBeDefined()
      expect(updatePatch.response_body).toBeUndefined()
      expect(updatePatch.response_code).toBeUndefined()
    })

    it('recusa IPv6 loopback literal ([::1])', async () => {
      rpcResult = { data: [claimedRow('https://[::1]:9200/x')], error: null }
      chainResult = { data: subRow, error: null }

      const res = await POST(req({ deliveryId: 'deliv-1' }))
      const body = await res.json()
      expect(body.ok).toBe(false)
      expect(body.error).toMatch(/não pode ser usado como fonte/)
      expect(fetchMock).not.toHaveBeenCalled()
      const updatePatch = calls['update']?.[0]?.[0]
      expect(updatePatch.response_body).toBeUndefined()
    })

    it('recusa forma hex do IPv4-mapeado em IPv6 (::ffff:127.0.0.1 → ::ffff:7f00:1)', async () => {
      rpcResult = { data: [claimedRow('https://[::ffff:127.0.0.1]:8443/x')], error: null }
      chainResult = { data: subRow, error: null }

      const res = await POST(req({ deliveryId: 'deliv-1' }))
      const body = await res.json()
      expect(body.ok).toBe(false)
      expect(body.error).toMatch(/não pode ser usado como fonte/)
      expect(fetchMock).not.toHaveBeenCalled()
      const updatePatch = calls['update']?.[0]?.[0]
      expect(updatePatch.response_body).toBeUndefined()
    })

    it('recusa CGNAT (100.64.0.5/10)', async () => {
      rpcResult = { data: [claimedRow('https://100.64.0.5/x')], error: null }
      chainResult = { data: subRow, error: null }

      const res = await POST(req({ deliveryId: 'deliv-1' }))
      const body = await res.json()
      expect(body.ok).toBe(false)
      expect(body.error).toMatch(/não pode ser usado como fonte/)
      expect(fetchMock).not.toHaveBeenCalled()
      const updatePatch = calls['update']?.[0]?.[0]
      expect(updatePatch.response_body).toBeUndefined()
    })
  })

  describe('entrega legítima continua funcionando', () => {
    it('entrega para host público normal e captura o response body', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock.mockResolvedValueOnce(new Response('{"received":true}', { status: 200 }))
      rpcResult = { data: [claimedRow('https://loja-cliente.com/webhooks/worder')], error: null }
      chainResult = { data: subRow, error: null }

      const res = await POST(req({ deliveryId: 'deliv-1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.status).toBe('delivered')
      expect(body.code).toBe(200)

      const updatePatch = calls['update']?.[0]?.[0]
      expect(updatePatch.status).toBe('delivered')
      expect(updatePatch.response_code).toBe(200)
      expect(updatePatch.response_body).toBe('{"received":true}')

      // header HMAC chegou ao fetch real
      const sentHeaders = new Headers(fetchMock.mock.calls[0][1].headers)
      expect(sentHeaders.get('X-Worder-Signature')).toBe('sha256=deadbeef')
    })

    // Re-review de cdeba429 (Minor, tratado como regressão): antes deste
    // commit, um 3xx era gravado como delivery falha e nada era reentregue —
    // seguir redirect nunca acontecia. Fazer a entrega seguir redirect
    // (correto: recebedores que respondem 3xx deixam de ficar permanentemente
    // "failed") abriu um jeito de um destino https responder 302 pra um
    // http:// arbitrário — o segundo salto levaria o corpo assinado E o
    // header X-Worder-Signature em texto claro. O guard segue seguindo
    // redirect (não voltamos a marcar 3xx como falha); só não pode pisar em
    // http no meio do caminho.
    it('recusa quando o primeiro salto responde 302 para http:// — não entrega, HMAC não vaza em texto claro', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'http://outra-cdn.com/hook' } }),
      )
      rpcResult = { data: [claimedRow('https://loja-cliente.com/webhooks/worder')], error: null }
      chainResult = { data: subRow, error: null }

      const res = await POST(req({ deliveryId: 'deliv-1' }))
      const body = await res.json()
      expect(body.ok).toBe(false)
      expect(body.error).toMatch(/não pode ser usado como fonte|não é permitido/)

      // só o primeiro salto (https) foi buscado — o destino http:// nunca
      // recebeu o payload nem a assinatura
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const updatePatch = calls['update']?.[0]?.[0]
      expect(updatePatch.response_body).toBeUndefined()
      expect(updatePatch.response_code).toBeUndefined()
    })

    it('segue redirect para outro host público e captura o response final, mantendo a assinatura HMAC', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://outra-cdn.com/hook' } }),
        )
        .mockResolvedValueOnce(new Response('{"received":true}', { status: 200 }))
      rpcResult = { data: [claimedRow('https://loja-cliente.com/webhooks/worder')], error: null }
      chainResult = { data: subRow, error: null }

      const res = await POST(req({ deliveryId: 'deliv-1' }))
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.status).toBe('delivered')
      expect(fetchMock).toHaveBeenCalledTimes(2)

      const updatePatch = calls['update']?.[0]?.[0]
      expect(updatePatch.response_body).toBe('{"received":true}')

      // a assinatura HMAC não é uma header de credencial da lista que o guard
      // derruba em salto cross-origin (Authorization/Cookie/Proxy-Authorization)
      const secondHopHeaders = new Headers(fetchMock.mock.calls[1][1].headers)
      expect(secondHopHeaders.get('X-Worder-Signature')).toBe('sha256=deadbeef')
    })
  })
})
