// ═══════════════════════════════════════════════════════════════════
// O recomendador de produtos, medido contra o da Omnisend.
//
// Quatro coisas que a tela oferecia e o envio não fazia:
//
//   "Produtos mais vendidos", "mais vistos" e "mais recentes" eram a
//   MESMA consulta — as três davam listas idênticas. Quem escolhia na
//   tela não recebia o que escolheu. O dado para fazer certo sempre
//   esteve lá: 1.072 pedidos em 90 dias só numa das lojas, e 1.572
//   visualizações de produto.
//
//   "Produtos visualizados recentemente" lia `tracking_events`, tabela
//   que está VAZIA. As visualizações moram em `contact_events`. Os
//   cinco feeds salvos no banco são todos desse tipo: nenhum nunca
//   funcionou.
//
//   "Se não houver resultado, usar…" era gravado e ignorado. Os cinco
//   feeds têm uma reserva escolhida.
//
//   "Últimos N dias" era gravado e ignorado.
//
// E uma quinta, que a Omnisend resolve com `purchaseExclusionDays`: a
// grade recomendava o produto que a pessoa acabara de comprar. Medido
// nos envios de Upsell: 3 de 3 no Dr. Groot.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

const FOTO = 'https://cdn.shopify.com/s/files/1/0735/x.jpg'

const LOJA = {
  id: 'loja-1', organization_id: 'org-1',
  shop_domain: 'loja.myshopify.com', is_active: true,
}

const CATALOGO = [
  { shopify_product_id: 'A', title: 'Produto A', handle: 'a', price: '10', images: [{ src: FOTO }], created_at: '2026-09-10' },
  { shopify_product_id: 'B', title: 'Produto B', handle: 'b', price: '20', images: [{ src: FOTO }], created_at: '2026-09-09' },
  { shopify_product_id: 'C', title: 'Produto C', handle: 'c', price: '30', images: [{ src: FOTO }], created_at: '2026-09-08' },
  { shopify_product_id: 'D', title: 'Produto D', handle: 'd', price: '40', images: [{ src: FOTO }], created_at: '2026-09-07' },
]

/** O que cada tabela devolve nesta rodada. */
let LINHAS: Record<string, any[]> = {}

function construtor(tabela: string): any {
  const api: any = {
    select: () => api, eq: () => api, in: () => api, or: () => api, not: () => api,
    order: () => api, limit: () => api, gte: () => api, lte: () => api,
    maybeSingle: async () => ({ data: (LINHAS[tabela] || [])[0] ?? null, error: null }),
    single: async () => ({ data: (LINHAS[tabela] || [])[0] ?? null, error: null }),
    then: (r: any) => Promise.resolve({ data: LINHAS[tabela] || [], error: null }).then(r),
  }
  return api
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => construtor(t), rpc: async () => ({ data: [], error: null }) },
}))

const { resolveProductFeed } = await import('../product-feeds')

const base = { orgId: 'org-1', storeId: 'loja-1', maxProducts: 4 }
const agora = new Date().toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  // Cada teste monta as suas linhas; o cache dos rankings é por
  // loja+janela, então cada um usa uma janela diferente para não herdar
  // a contagem do anterior.
  LINHAS = { shopify_stores: [LOJA], shopify_products: CATALOGO }
})

describe('mais vendidos conta venda de verdade', () => {
  it('a ordem é a das quantidades vendidas, não a do catálogo', async () => {
    LINHAS.shopify_orders = [
      { line_items: [{ product_id: 'D', quantity: 5 }, { product_id: 'C', quantity: 1 }] },
      { line_items: [{ product_id: 'D', quantity: 4 }, { product_id: 'B', quantity: 2 }] },
    ]
    const p = await resolveProductFeed({ ...base, feedType: 'bestsellers', feedId: undefined } as any)
    // D vendeu 9, B vendeu 2, C vendeu 1. A ordem do catálogo seria A,B,C,D.
    expect(p.map((x: any) => x.title)).toEqual(['Produto D', 'Produto B', 'Produto C'])
  })
})

describe('mais vistos conta visualização de verdade', () => {
  it('a ordem é a das visualizações', async () => {
    LINHAS.contact_events = [
      { properties: { product_id: 'C' }, occurred_at: agora },
      { properties: { product_id: 'C' }, occurred_at: agora },
      { properties: { product_id: 'C' }, occurred_at: agora },
      { properties: { product_id: 'A' }, occurred_at: agora },
    ]
    const p = await resolveProductFeed({ ...base, feedType: 'most_viewed' } as any)
    expect(p.map((x: any) => x.title)).toEqual(['Produto C', 'Produto A'])
  })
})

describe('visualizados recentemente lê a tabela certa', () => {
  it('sai na ordem em que o contato viu, sem repetir produto', async () => {
    LINHAS.contact_events = [
      { properties: { product_id: 'C' }, occurred_at: agora },
      { properties: { product_id: 'A' }, occurred_at: agora },
      { properties: { product_id: 'C' }, occurred_at: agora },
    ]
    const p = await resolveProductFeed({
      ...base, feedType: 'recently_viewed', contactId: 'contato-1',
    } as any)
    expect(p.map((x: any) => x.title)).toEqual(['Produto C', 'Produto A'])
  })

  it('sem contato, não inventa histórico — cai na reserva', async () => {
    LINHAS.contact_events = []
    const p = await resolveProductFeed({ ...base, feedType: 'recently_viewed' } as any)
    // Sem reserva configurada, a cadeia fecha em "mais recentes".
    expect(p.length).toBe(4)
  })
})

describe('a reserva configurada vale', () => {
  it('estratégia sem resultado cai na reserva escolhida', async () => {
    LINHAS.product_feeds = [{ filters: [], excluded_product_ids: [], fallback_type: 'bestsellers', time_period: '30d' }]
    LINHAS.contact_events = [] // nada visto
    LINHAS.shopify_orders = [{ line_items: [{ product_id: 'B', quantity: 9 }] }]
    const p = await resolveProductFeed({
      ...base, feedType: 'most_viewed', feedId: 'feed-1',
    } as any)
    expect(p.map((x: any) => x.title)).toEqual(['Produto B'])
  })

  it('sem reserva escolhida, fecha em "mais recentes"', async () => {
    LINHAS.product_feeds = [{ filters: [], excluded_product_ids: [], fallback_type: '', time_period: '7d' }]
    LINHAS.contact_events = []
    const p = await resolveProductFeed({
      ...base, feedType: 'most_viewed', feedId: 'feed-1',
    } as any)
    expect(p.length).toBe(4)
  })

  it('gatilho sem produto por natureza continua sem inventar', async () => {
    LINHAS.shopify_orders = [{ line_items: [{ product_id: 'A', quantity: 3 }] }]
    const p = await resolveProductFeed({
      ...base, feedType: 'trigger_auto',
      eventData: { event_type: 'page_viewed', url: 'https://loja/sobre' },
    } as any)
    expect(p.length).toBe(0)
  })
})

describe('não recomenda o que a pessoa acabou de comprar', () => {
  const pedido = {
    order_id: '999', event_type: 'order_paid',
    Items: [{ ProductID: 'A', ProductName: 'Produto A' }],
  }

  it('o produto comprado sai da grade', async () => {
    const p = await resolveProductFeed({ ...base, feedType: 'newest', eventData: pedido } as any)
    expect(p.map((x: any) => x.title)).not.toContain('Produto A')
    expect(p.length).toBe(3)
  })

  it('se TODOS foram comprados, a grade não fica vazia', async () => {
    const tudo = {
      order_id: '999', event_type: 'order_paid',
      Items: CATALOGO.map((p) => ({ ProductID: p.shopify_product_id })),
    }
    const p = await resolveProductFeed({ ...base, feedType: 'newest', eventData: tudo } as any)
    expect(p.length).toBe(4)
  })

  it('o feed que existe para MOSTRAR o pedido continua mostrando', async () => {
    const p = await resolveProductFeed({
      ...base, feedType: 'trigger_order',
      eventData: { order_id: '999', Items: [{ ProductID: 'A', ProductName: 'Produto A', ItemPrice: 10, Quantity: 1 }] },
    } as any)
    expect(p.map((x: any) => x.title)).toContain('Produto A')
  })

  it('evento que não é pedido não esconde nada', async () => {
    const p = await resolveProductFeed({
      ...base, feedType: 'newest',
      eventData: { event_type: 'checkout_started', Items: [{ ProductID: 'A' }] },
    } as any)
    expect(p.length).toBe(4)
  })
})
