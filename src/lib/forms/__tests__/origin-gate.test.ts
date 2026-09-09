import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkPopupOrigin, claimedDomain } from '../origin-gate'

// Loja fictícia por domínio, no formato que resolveStoreByDomain devolve.
const STORES: Record<string, { id: string; organization_id: string }> = {
  'loja-a.myshopify.com': { id: 'store-a', organization_id: 'org-1' },
  'loja-b.myshopify.com': { id: 'store-b', organization_id: 'org-1' },
  'rival.myshopify.com': { id: 'store-x', organization_id: 'org-2' },
}

vi.mock('@/lib/shopify/resolve-store-by-domain', () => ({
  resolveStoreByDomain: async (_admin: any, domain: string) => STORES[domain] || null,
}))

const admin: any = {}
const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null })

beforeEach(() => { process.env.NEXT_PUBLIC_APP_URL = 'https://app.worder.test' })

describe('de onde veio a requisição', () => {
  it('lê o domínio explícito antes do Origin, e o Origin antes do Referer', () => {
    expect(claimedDomain(headers({ origin: 'https://o.test' }), 'loja-a.myshopify.com')).toBe('loja-a.myshopify.com')
    expect(claimedDomain(headers({ origin: 'https://o.test', referer: 'https://r.test/x' }))).toBe('o.test')
    expect(claimedDomain(headers({ referer: 'https://r.test/x' }))).toBe('r.test')
    expect(claimedDomain(headers({}))).toBeNull()
    expect(claimedDomain(headers({ origin: 'lixo' }))).toBe('lixo')
  })

  it('recusa origem de outra organização — o ataque que motivou a régua', async () => {
    const v = await checkPopupOrigin(admin, headers({ origin: 'https://rival.myshopify.com' }), { organization_id: 'org-1', store_id: 'store-a' })
    expect(v).toEqual({ ok: false, reason: 'origem de outra organização' })
  })

  it('recusa a loja irmã quando o popup é de uma loja específica', async () => {
    const v = await checkPopupOrigin(admin, headers({ origin: 'https://loja-b.myshopify.com' }), { organization_id: 'org-1', store_id: 'store-a' })
    expect(v).toEqual({ ok: false, reason: 'origem de outra loja' })
  })

  it('aceita a própria loja do popup', async () => {
    const v = await checkPopupOrigin(admin, headers({ origin: 'https://loja-a.myshopify.com' }), { organization_id: 'org-1', store_id: 'store-a' })
    expect(v).toMatchObject({ ok: true, storeId: 'store-a' })
  })

  it('popup sem loja aceita qualquer loja da própria organização', async () => {
    const v = await checkPopupOrigin(admin, headers({ origin: 'https://loja-b.myshopify.com' }), { organization_id: 'org-1', store_id: null })
    expect(v).toMatchObject({ ok: true, storeId: 'store-b' })
  })

  it('domínio desconhecido: passa no popup sem loja (embed em site próprio), barra no preso a uma loja', async () => {
    const livre = await checkPopupOrigin(admin, headers({ origin: 'https://site-do-lojista.com.br' }), { organization_id: 'org-1', store_id: null })
    expect(livre.ok).toBe(true)
    const preso = await checkPopupOrigin(admin, headers({ origin: 'https://site-do-lojista.com.br' }), { organization_id: 'org-1', store_id: 'store-a' })
    expect(preso).toEqual({ ok: false, reason: 'origem desconhecida' })
  })

  it('sem origem alguma: só passa quando o popup não tem loja', async () => {
    expect((await checkPopupOrigin(admin, headers({}), { organization_id: 'org-1', store_id: null })).ok).toBe(true)
    expect(await checkPopupOrigin(admin, headers({}), { organization_id: 'org-1', store_id: 'store-a' }))
      .toEqual({ ok: false, reason: 'sem origem' })
  })

  it('a página de embed da própria Worder sempre passa', async () => {
    const v = await checkPopupOrigin(admin, headers({ origin: 'https://app.worder.test' }), { organization_id: 'org-1', store_id: 'store-a' })
    expect(v).toMatchObject({ ok: true })
  })
})
