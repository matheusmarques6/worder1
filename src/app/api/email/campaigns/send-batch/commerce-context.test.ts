import { describe, expect, it } from 'vitest'
import { loadCampaignCommerceContext } from './commerce-context'

type Result = { data: Record<string, unknown> | null; error: Error | null }

function fakeClient(results: Record<string, Result | Promise<Result>>) {
  const calls: Record<string, { eq: Array<[string, unknown]>; or: string[] }> = {}

  return {
    calls,
    client: {
      from(table: string) {
        calls[table] = { eq: [], or: [] }
        const query: any = {
          select: () => query,
          eq: (key: string, value: unknown) => {
            calls[table].eq.push([key, value])
            return query
          },
          or: (filter: string) => {
            calls[table].or.push(filter)
            return query
          },
          order: () => query,
          limit: () => query,
          maybeSingle: () => Promise.resolve(results[table]),
        }
        return query
      },
    } as any,
  }
}

const contact = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'same@example.test',
}

describe('loadCampaignCommerceContext', () => {
  it('scopes orders and carts to the authorized organization and store', async () => {
    const { client, calls } = fakeClient({
      shopify_orders: { data: { order_number: 'A' }, error: null },
      shopify_checkouts: { data: { recovery_url: 'https://a.test/cart' }, error: null },
    })

    const result = await loadCampaignCommerceContext(client, 'org-a', 'store-a', contact)

    expect(result.order?.order_number).toBe('A')
    expect(result.cart?.recovery_url).toBe('https://a.test/cart')
    for (const table of ['shopify_orders', 'shopify_checkouts']) {
      expect(calls[table].eq).toEqual(expect.arrayContaining([
        ['organization_id', 'org-a'],
        ['store_id', 'store-a'],
      ]))
    }
  })

  it('keeps a hostile email inside one quoted PostgREST value', async () => {
    const { client, calls } = fakeClient({
      shopify_orders: { data: null, error: null },
      shopify_checkouts: { data: null, error: null },
    })
    const hostile = 'x%_\\",contact_id.not.is.null,(x@example.test'

    await loadCampaignCommerceContext(client, 'org-a', null, { ...contact, email: hostile })

    const expected =
      'email.ilike.' +
      JSON.stringify('x\\%\\_\\\\",contact\\_id.not.is.null,(x@example.test') +
      ',contact_id.eq.' +
      contact.id
    expect(calls.shopify_orders.or).toEqual([expected])
    expect(calls.shopify_checkouts.or).toEqual([expected])
  })

  it('preserves a valid cart when the order lookup fails', async () => {
    const { client } = fakeClient({
      shopify_orders: { data: null, error: new Error('orders unavailable') },
      shopify_checkouts: { data: { recovery_url: 'https://a.test/cart' }, error: null },
    })

    await expect(loadCampaignCommerceContext(client, 'org-a', 'store-a', contact)).resolves.toEqual({
      order: null,
      cart: { recovery_url: 'https://a.test/cart' },
    })
  })

  it('preserves a valid order when the cart lookup rejects', async () => {
    const { client } = fakeClient({
      shopify_orders: { data: { order_number: 'A' }, error: null },
      shopify_checkouts: Promise.reject(new Error('carts unavailable')),
    })

    await expect(loadCampaignCommerceContext(client, 'org-a', null, contact)).resolves.toEqual({
      order: { order_number: 'A' },
      cart: null,
    })
  })
})
