import { describe, it, expect } from 'vitest'
import { resolveStoreShopDomain, buildStoreContext } from '../store-host'

function mockClient(domainById: Record<string, string | null>, calls: { n: number }) {
  return {
    from() {
      return {
        select() { return this },
        eq(_col: string, id: string) { this._id = id; return this },
        _id: '',
        async maybeSingle() {
          calls.n++
          const d = domainById[(this as any)._id]
          return { data: d === undefined ? null : { shop_domain: d } }
        },
      }
    },
  } as any
}

describe('store-host', () => {
  it('resolves shop_domain by store id', async () => {
    const calls = { n: 0 }
    const c = mockClient({ 's1': 'drgroot.com.br' }, calls)
    expect(await resolveStoreShopDomain(c, 's1')).toBe('drgroot.com.br')
  })

  it('returns null for missing store / null id / no client', async () => {
    const calls = { n: 0 }
    const c = mockClient({}, calls)
    expect(await resolveStoreShopDomain(c, 's-unknown-xyz')).toBe(null)
    expect(await resolveStoreShopDomain(c, null)).toBe(null)
    expect(await resolveStoreShopDomain(null, 's1')).toBe(null)
  })

  it('caches per store id (one lookup)', async () => {
    const calls = { n: 0 }
    const c = mockClient({ 's-cache-test': 'a.myshopify.com' }, calls)
    await resolveStoreShopDomain(c, 's-cache-test')
    await resolveStoreShopDomain(c, 's-cache-test')
    expect(calls.n).toBe(1)
  })

  it('buildStoreContext wraps domain or undefined', async () => {
    const calls = { n: 0 }
    const c = mockClient({ 's-ctx': 'loja.com' }, calls)
    expect(await buildStoreContext(c, 's-ctx')).toEqual({ domain: 'loja.com' })
    expect(await buildStoreContext(c, null)).toBe(undefined)
  })
})
