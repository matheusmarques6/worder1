// ═══════════════════════════════════════════════════════════════════
// Produto sem foto não abre a grade de recomendação.
//
// O feed de catálogo ordena do mais novo para o mais antigo e corta no
// limite. No catálogo real de uma das lojas, os dois produtos MAIS
// NOVOS são "Test Product" sem imagem nenhuma — então eles ocupavam as
// duas primeiras vagas de toda grade daquela loja, e o cliente recebia
// dois retângulos cinzas onde deviam estar os produtos.
//
// Quem tem foto passa na frente. Os sem foto não são banidos: eles
// completam a grade se não houver outros, porque grade com um cinza
// ainda é melhor do que grade que some.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

const FOTO = 'https://cdn.shopify.com/s/files/1/0735/x.jpg'

/** O catálogo, do mais novo para o mais antigo — a ordem que o feed usa. */
let CATALOGO: any[] = []

const LOJA = {
  id: 'loja-1', organization_id: 'org-1',
  shop_domain: 'loja.myshopify.com', is_active: true,
}

function construtor(tabela: string): any {
  const linhas = () => (tabela === 'shopify_products' ? CATALOGO : tabela === 'shopify_stores' ? [LOJA] : [])
  const api: any = {
    select: () => api, eq: () => api, in: () => api, or: () => api, not: () => api,
    order: () => api, limit: () => api, gte: () => api, lte: () => api,
    maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
    single: async () => ({ data: linhas()[0] ?? null, error: null }),
    then: (r: any) => Promise.resolve({ data: linhas(), error: null }).then(r),
  }
  return api
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => construtor(t), rpc: async () => ({ data: [], error: null }) },
}))

const { resolveProductFeed } = await import('../product-feeds')

const base = { orgId: 'org-1', storeId: 'loja-1', feedType: 'bestsellers', maxProducts: 4 }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('o catálogo prefere quem tem foto', () => {
  it('os "Test Product" sem imagem não abrem mais a grade', async () => {
    CATALOGO = [
      { shopify_product_id: '1', title: 'Test Product', handle: 't1', price: '0', images: [] },
      { shopify_product_id: '2', title: 'Test Product', handle: 't2', price: '0', images: null },
      { shopify_product_id: '3', title: 'Miracle in Shower', handle: 'm', price: '29.90', images: [{ src: FOTO }] },
      { shopify_product_id: '4', title: 'Thickening Shampoo', handle: 's', price: '25.00', images: [{ src: FOTO }] },
    ]
    const p = await resolveProductFeed({ ...base, maxProducts: 2 } as any)
    expect(p.map((x: any) => x.title)).toEqual(['Miracle in Shower', 'Thickening Shampoo'])
    expect(p.every((x: any) => x.image_url)).toBe(true)
  })

  it('sem nenhum com foto, a grade ainda sai — vazia é pior', async () => {
    CATALOGO = [
      { shopify_product_id: '1', title: 'Sem foto A', handle: 'a', price: '10', images: [] },
      { shopify_product_id: '2', title: 'Sem foto B', handle: 'b', price: '20', images: [] },
    ]
    const p = await resolveProductFeed({ ...base, maxProducts: 2 } as any)
    expect(p.length).toBe(2)
  })

  it('os sem foto completam quando os com foto não dão conta', async () => {
    CATALOGO = [
      { shopify_product_id: '1', title: 'Sem foto', handle: 'a', price: '10', images: [] },
      { shopify_product_id: '2', title: 'Com foto', handle: 'b', price: '20', images: [{ src: FOTO }] },
    ]
    const p = await resolveProductFeed({ ...base, maxProducts: 4 } as any)
    expect(p.map((x: any) => x.title)).toEqual(['Com foto', 'Sem foto'])
  })

  it('o limite pedido continua sendo respeitado', async () => {
    CATALOGO = Array.from({ length: 30 }, (_, i) => ({
      shopify_product_id: String(i), title: `P${i}`, handle: `p${i}`, price: '10', images: [{ src: FOTO }],
    }))
    const p = await resolveProductFeed({ ...base, maxProducts: 4 } as any)
    expect(p.length).toBe(4)
  })
})
