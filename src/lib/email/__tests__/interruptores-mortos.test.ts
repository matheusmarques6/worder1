// ═══════════════════════════════════════════════════════════════════
// Dois interruptores do painel que não faziam nada.
//
//   "Mostrar preferências" (rodapé) — o editor desenhava o link e o HTML
//   enviado não o emitia. A página `/preferencias` existe e o link dela
//   é assinado igual ao de descadastro; faltava o rodapé pedir por ele.
//
//   "Mostrar itens fora de estoque" (produtos do gatilho) — o painel
//   oferecia a opção, desligada por padrão, e o envio ignorava. O
//   cliente recebia um e-mail de carrinho com um item que não pode
//   comprar. Na loja que mais envia, 47 dos 136 produtos estão
//   marcados como indisponíveis.
//
// E o terceiro caso, que é o oposto: `{{unsubscribe_url}}` só era
// preenchido nas rotas de teste e pré-visualização. No envio real o
// "Descadastrar-se" do rodapé ia com `href=""` — link de descadastro
// morto —, e como o detector procura um anchor apontando para
// `/unsubscribe`, o vazio não era reconhecido e um SEGUNDO rodapé era
// anexado embaixo.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Sem segredo, os links de sistema caem na forma não assinada — e é
// justamente esse caminho que precisa continuar honesto.
process.env.UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || 'segredo-de-teste'

const CATALOGO: any[] = [
  { shopify_product_id: '111', available: true },
  { shopify_product_id: '222', available: false },
  { shopify_product_id: '333', available: null },
]

function tabela(nome: string): any {
  const linhas = () => (nome === 'shopify_products' ? CATALOGO : [])
  const api: any = {
    select: () => api, eq: () => api, in: () => api, or: () => api, not: () => api,
    order: () => api, limit: () => api, gte: () => api,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (r: any) => Promise.resolve({ data: linhas(), error: null }).then(r),
  }
  return api
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => tabela(t), rpc: async () => ({ data: [], error: null }) },
}))

vi.mock('@/lib/email/product-feeds', () => ({
  resolveProductFeed: async () => [],
  resolveFeedStore: async () => ({ id: 'loja-1', host: 'loja.com' }),
}))

const { resolveCartBlocks, prepareEmailHtml } = await import('../render')
const { renderDocumentToHtml } = await import('../render-html')

function docRodape(props: Record<string, any>) {
  return {
    version: 2,
    settings: { fontFamily: 'Arial, sans-serif', backgroundColor: '#fff', contentWidth: 600 },
    sections: [{ id: 's1', styles: {}, columns: [{ id: 'c1', blocks: [{ id: 'b1', type: 'footer', props }] }] }],
  } as any
}

function blocoCarrinho(cfg: Record<string, any> = {}) {
  const json = encodeURIComponent(JSON.stringify({
    type: 'abandoned-cart', showImage: true, showName: true, showPrice: true,
    layoutType: 'image-left', imageWidth: 120, ...cfg,
  }))
  return `<!-- WORDER_CART_BLOCK:${json} -->`
}

const EVENTO = {
  line_items: [
    { title: 'Disponível', price: '10.00', product_id: '111' },
    { title: 'Esgotado', price: '20.00', product_id: '222' },
    { title: 'Sem informação', price: '30.00', product_id: '333' },
  ],
}

const ENVIO = {
  emailSendId: '11111111-1111-4111-8111-111111111111',
  baseUrl: 'https://app.worder.com.br',
  contactId: '22222222-2222-4222-8222-222222222222',
  orgId: '33333333-3333-4333-8333-333333333333',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('o link de descadastro do rodapé', () => {
  it('sai com destino de verdade, não href vazio', () => {
    const estatico = renderDocumentToHtml(docRodape({
      companyName: 'Loja', showUnsubscribe: true, padding: { top: 8, right: 8, bottom: 8, left: 8 },
    }))
    expect(estatico).toContain('{{unsubscribe_url}}')
    const html = prepareEmailHtml({ ...ENVIO, html: estatico, mergeData: {} })
    expect(html).not.toContain('href=""')
    expect(html).not.toContain('{{unsubscribe_url}}')
    expect(html).toContain(encodeURIComponent('/unsubscribe?token='))
  })

  it('com o rodapé do template resolvido, não se anexa um segundo', () => {
    const estatico = renderDocumentToHtml(docRodape({
      companyName: 'Loja', showUnsubscribe: true, showPreferences: true,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
    }))
    const html = prepareEmailHtml({ ...ENVIO, html: estatico, mergeData: {} })
    expect(html).not.toContain('Cancelar inscrição')
    expect(html).not.toContain('Você recebeu este e-mail porque se inscreveu')
  })
})

describe('"Mostrar preferências"', () => {
  it('ligado, o link sai — e com destino assinado', () => {
    const estatico = renderDocumentToHtml(docRodape({
      companyName: 'Loja', showUnsubscribe: true, showPreferences: true,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
    }))
    expect(estatico).toContain('{{preferences_url}}')
    expect(estatico).toContain('Preferências')
    const html = prepareEmailHtml({ ...ENVIO, html: estatico, mergeData: {} })
    expect(html).toContain(encodeURIComponent('/preferencias?token='))
  })

  it('desligado, não sai nada', () => {
    const estatico = renderDocumentToHtml(docRodape({
      companyName: 'Loja', showUnsubscribe: true, showPreferences: false,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
    }))
    expect(estatico).not.toContain('{{preferences_url}}')
  })
})

describe('"Ver no navegador" não tem destino honesto', () => {
  it('o link inteiro sai, em vez de ir morto ou para a home da loja', () => {
    const estatico = renderDocumentToHtml(docRodape({
      companyName: 'Loja', showUnsubscribe: true, showViewInBrowser: true,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
    }))
    expect(estatico).toContain('Ver no navegador')
    const html = prepareEmailHtml({ ...ENVIO, html: estatico, mergeData: { store_url: 'https://loja.com' } })
    expect(html).not.toContain('Ver no navegador')
    expect(html).not.toContain('{{view_in_browser_url}}')
    // Nem o separador solto sobra.
    expect(html).not.toMatch(/Descadastrar-se<\/a>\s*·\s*<\/p>/)
  })
})

describe('"Mostrar itens fora de estoque"', () => {
  it('desligado, o esgotado sai do e-mail', async () => {
    const html = await resolveCartBlocks(blocoCarrinho(), 'org-1', undefined, EVENTO, null, null, 'loja-1')
    expect(html).toContain('Disponível')
    expect(html).toContain('Sem informação')
    expect(html).not.toContain('Esgotado')
  })

  it('ligado, tudo continua aparecendo', async () => {
    const html = await resolveCartBlocks(
      blocoCarrinho({ showOutOfStock: true }), 'org-1', undefined, EVENTO, null, null, 'loja-1'
    )
    expect(html).toContain('Esgotado')
  })

  it('se TODOS estão esgotados, o bloco não fica vazio', async () => {
    const soEsgotado = { line_items: [{ title: 'Esgotado', price: '20.00', product_id: '222' }] }
    const html = await resolveCartBlocks(blocoCarrinho(), 'org-1', undefined, soEsgotado, null, null, 'loja-1')
    // Carrinho anunciando item esgotado ainda é melhor do que carrinho
    // nenhum.
    expect(html).toContain('Esgotado')
  })
})
