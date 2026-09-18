// ═══════════════════════════════════════════════════════════════════
// Quando um bloco dinâmico não tem o que mostrar, ele tem de sumir
// INTEIRO.
//
// Os três blocos que dependem de dado no envio — grade de produtos,
// produtos do gatilho e resumo do pedido — trocavam só o marcador por
// vazio. A célula que o continha ficava, com o respiro configurado
// dentro: `<tr><td style="padding:24px"></td></tr>`. No e-mail isso é
// uma faixa de espaço em branco no meio da mensagem — o buraco que se
// vê quando "o bloco não aparece".
//
// A grade ainda tinha o agravante do título, que ficava fora do
// marcador e sobrevivia sozinho.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

const vazio = { data: [], error: null }
const tabela = () => ({
  select: () => tabela(), eq: () => tabela(), in: () => tabela(), or: () => tabela(),
  not: () => tabela(), limit: () => tabela(), order: () => tabela(), gte: () => tabela(),
  maybeSingle: async () => ({ data: null, error: null }),
  single: async () => ({ data: null, error: null }),
  then: (r: any) => Promise.resolve(vazio).then(r),
})

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: () => tabela(), rpc: async () => vazio },
}))

vi.mock('@/lib/email/product-feeds', () => ({
  resolveProductFeed: async () => [],
  resolveFeedStore: async () => ({ id: null, host: '' }),
}))

const { resolveProductBlocks, resolveCartBlocks, resolveOrderBlocks } = await import('../render')
const { renderDocumentToHtml } = await import('../render-html')

function documento(bloco: Record<string, any>) {
  return {
    version: 2,
    settings: { fontFamily: 'Arial, sans-serif', backgroundColor: '#ffffff', contentWidth: 600 },
    sections: [{
      id: 's1', styles: {},
      columns: [{ id: 'c1', blocks: [{ id: 'b1', ...bloco }] }],
    }],
  } as any
}

/** O respiro do bloco: se ele sobreviver, sobrou uma faixa em branco. */
const RESPIRO = 'padding:32px 24px 32px 24px'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('grade de produtos sem produto', () => {
  const doc = documento({
    type: 'product-grid',
    props: {
      mode: 'dynamic', feedType: '', title: 'Recomendados Para Você',
      columns: 2, rows: 2, padding: { top: 32, right: 24, bottom: 32, left: 24 },
    },
  })

  it('o título não fica sozinho — era ele que sobrava no e-mail', async () => {
    const html = await resolveProductBlocks(renderDocumentToHtml(doc), 'org-1', undefined, {}, 'loja-1')
    expect(html).not.toContain('Recomendados Para Você')
  })

  it('a faixa de espaço em branco também vai embora', async () => {
    const estatico = renderDocumentToHtml(doc)
    expect(estatico).toContain(RESPIRO) // o respiro existe antes
    const html = await resolveProductBlocks(estatico, 'org-1', undefined, {}, 'loja-1')
    expect(html).not.toContain(RESPIRO)
    expect(html).not.toContain('WORDER_PRODUCT_BLOCK')
  })
})

describe('produtos do gatilho sem item', () => {
  it('a célula inteira sai, não só o marcador', async () => {
    const doc = documento({
      type: 'abandoned-cart',
      props: { layoutType: 'image-left', padding: { top: 32, right: 24, bottom: 32, left: 24 } },
    })
    const estatico = renderDocumentToHtml(doc)
    expect(estatico).toContain(RESPIRO)
    const html = await resolveCartBlocks(estatico, 'org-1', undefined, {})
    expect(html).not.toContain(RESPIRO)
    expect(html).not.toContain('WORDER_CART_BLOCK')
  })
})

describe('resumo do pedido sem item', () => {
  it('a célula inteira sai, não só o marcador', () => {
    const doc = documento({
      type: 'order-products',
      props: { showTitle: true, titleText: 'Resumo do Pedido', padding: { top: 32, right: 24, bottom: 32, left: 24 } },
    })
    const estatico = renderDocumentToHtml(doc)
    expect(estatico).toContain(RESPIRO)
    const html = resolveOrderBlocks(estatico, { order_id: '123' })
    expect(html).not.toContain(RESPIRO)
    expect(html).not.toContain('WORDER_ORDER_BLOCK')
    expect(html).not.toContain('Resumo do Pedido')
  })
})

describe('o bloco que TEM conteúdo continua inteiro', () => {
  it('a grade com produto mantém título, respiro e cartões', async () => {
    vi.resetModules()
    vi.doMock('@/lib/email/product-feeds', () => ({
      resolveProductFeed: async () => [
        { title: 'Serum', price: 23.51, image_url: 'https://cdn.shopify.com/s/x.jpg', url: 'https://loja/p/s' },
      ],
      resolveFeedStore: async () => ({ id: 'loja-1', host: 'loja.com' }),
    }))
    const { resolveProductBlocks: resolver } = await import('../render')
    const doc = documento({
      type: 'product-grid',
      props: {
        mode: 'dynamic', feedType: '', title: 'Recomendados Para Você',
        titleColor: '#ffffff', columns: 2, rows: 2,
        padding: { top: 32, right: 24, bottom: 32, left: 24 },
      },
    })
    const html = await resolver(renderDocumentToHtml(doc), 'org-1', undefined, {}, 'loja-1')
    expect(html).toContain('Recomendados Para Você')
    expect(html).toContain('color:#ffffff')
    expect(html).toContain('Serum')
    expect(html).toContain(RESPIRO)
  })
})
