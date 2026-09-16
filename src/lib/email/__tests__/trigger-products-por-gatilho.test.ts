// ═══════════════════════════════════════════════════════════════════
// O bloco "Produtos do Gatilho", gatilho por gatilho.
//
// As cargas aqui não são inventadas: são a forma real de
// `automation_runs.metadata.trigger_data` das 1.321 execuções que
// existem no banco, uma por tipo de gatilho.
//
// O que a medição mostrou antes da correção:
//
//   trigger_checkout_abandoned   603 execuções, `Items` no topo     ✓
//   trigger_fulfilled_order       86 execuções, `Items` no topo     ✓
//   trigger_viewed_product        12 execuções, via `event_type`    ✓
//   trigger_order_paid           338 execuções, SÓ `order_id`       ✗
//
// O `trigger_order_paid` é o e-mail de confirmação de compra — o
// e-mail em que os produtos comprados são o conteúdo. Ele saía sem
// produto nenhum, porque o despacho do webhook manda só o id do
// pedido. Os itens estavam no banco o tempo todo: 105 dos 106 pedidos
// desses fluxos têm `line_items` completo em `shopify_orders`.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

const FOTO = 'https://cdn.shopify.com/s/files/1/0735/serum.jpg?v=1'

// Linhas que o banco devolveria. `shopify_orders.line_items` vem SEM
// foto — quem completa é o enriquecimento por `shopify_products`.
const LINHAS: Record<string, any[]> = {
  shopify_orders: [{ line_items: [
    { id: 1, title: 'Fresh That Lasts Deodorant', price: '29.90', quantity: 1,
      product_id: 10466632630591, variant_id: 53695489605951, vendor: 'medicube' },
  ] }],
  shopify_checkouts: [{ line_items: [
    { id: 2, title: 'Zero Pore Pads', price: '32.95', quantity: 1, product_id: 777, variant_id: 888 },
  ] }],
  shopify_products: [
    { shopify_product_id: '10466632630591', title: 'Fresh That Lasts Deodorant',
      handle: 'fresh-deo', images: [{ id: 9, src: FOTO }], variants: [{ id: 53695489605951 }], price: '29.90' },
    { shopify_product_id: '777', title: 'Zero Pore Pads', handle: 'zero-pore',
      images: [{ id: 10, src: FOTO }], variants: [{ id: 888 }], price: '32.95' },
  ],
  shopify_stores: [{ id: 'loja-1', organization_id: 'org-1', shop_domain: 'loja.myshopify.com', is_active: true }],
}

function construtor(tabela: string) {
  const estado = { tabela }
  const api: any = {
    select: () => api, eq: () => api, in: () => api, or: () => api,
    order: () => api, limit: () => api, gte: () => api, lte: () => api, not: () => api,
    maybeSingle: async () => ({ data: (LINHAS[estado.tabela] || [])[0] ?? null, error: null }),
    single: async () => ({ data: (LINHAS[estado.tabela] || [])[0] ?? null, error: null }),
    then: (r: any) => Promise.resolve({ data: LINHAS[estado.tabela] || [], error: null }).then(r),
  }
  return api
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => construtor(t), rpc: async () => ({ data: [], error: null }) },
}))

const { resolveProductFeed } = await import('../product-feeds')

const base = { orgId: 'org-1', storeId: 'loja-1', feedType: 'trigger_auto', maxProducts: 10 }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Produtos do Gatilho, por gatilho', () => {
  it('Checkout Abandonado: `Items` no topo, como o webhook monta', async () => {
    const p = await resolveProductFeed({
      ...base,
      eventData: {
        event_type: 'checkout_started',
        CheckoutId: 'c1',
        Items: [{ ProductID: '777', ProductName: 'Zero Pore Pads', ItemPrice: 32.95, Quantity: 1, ImageURL: FOTO }],
      },
    } as any)
    expect(p.length).toBe(1)
    expect(p[0].title).toBe('Zero Pore Pads')
    expect(p[0].image_url).toBe(FOTO)
  })

  it('Pedido Enviado: mesma forma, com vários itens', async () => {
    const p = await resolveProductFeed({
      ...base,
      eventData: {
        event_type: 'fulfilled_order',
        Items: [
          { ProductID: '777', ProductName: 'A', ItemPrice: 10, Quantity: 1, ImageURL: FOTO },
          { ProductID: '778', ProductName: 'B', ItemPrice: 20, Quantity: 2, ImageURL: FOTO },
        ],
      },
    } as any)
    expect(p.length).toBe(2)
  })

  it('Visualizou Produto: um produto só, por `event_type` e `properties`', async () => {
    const p = await resolveProductFeed({
      ...base,
      eventData: {
        event_type: 'viewed_product',
        product_id: '8735226429607',
        properties: {
          product_id: '8735226429607',
          product_title: 'Serum',
          price: '23.51',
          image_url: FOTO,
          product_url: 'https://loja/p/serum',
        },
      },
    } as any)
    expect(p.length).toBe(1)
    expect(p[0].title).toBe('Serum')
    expect(p[0].image_url).toBe(FOTO)
  })

  it('Pedido Pago: só o id do pedido — os itens vêm do banco', async () => {
    // Era esta a falha: 338 execuções sem produto nenhum no e-mail de
    // confirmação de compra.
    const p = await resolveProductFeed({
      ...base,
      eventData: {
        order_id: '7281908711593',
        order_number: '#1234',
        total_price: 29.9,
        currency: 'USD',
      },
    } as any)
    expect(p.length).toBe(1)
    expect(p[0].title).toContain('Deodorant')
    // Sem foto no `line_items` do pedido: quem completa é o
    // enriquecimento por `shopify_products`.
    expect(p[0].image_url).toBe(FOTO)
    expect(p[0].url).toContain('/products/fresh-deo')
  })

  it('Só o id do checkout também resolve', async () => {
    const p = await resolveProductFeed({
      ...base,
      eventData: { checkout_id: 'abc123', currency: 'USD' },
    } as any)
    expect(p.length).toBe(1)
    expect(p[0].title).toBe('Zero Pore Pads')
  })

  it('Gatilho sem produto por natureza não inventa produto', async () => {
    // "Inscrito via Popup" e "Visualizou Página" não têm produto, e o
    // certo é o bloco não renderizar nada — não encher de bestseller.
    const p = await resolveProductFeed({
      ...base,
      eventData: { event_type: 'page_viewed', url: 'https://loja/sobre' },
    } as any)
    expect(p.length).toBe(0)
  })
})
