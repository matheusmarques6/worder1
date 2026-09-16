// ═══════════════════════════════════════════════════════════════════
// O bloco de produto do gatilho: a imagem tem de caber na caixa.
//
// O defeito, como aparecia na tela: um frasco de sérum ocupando a
// altura inteira do e-mail ao lado de duas linhas de texto. A causa
// estava numa linha do HTML gerado — `width:200px;height:auto` — que
// trava a largura e deixa a altura livre. Com foto de produto, que é
// alta e estreita, isso vira centenas de pixels de altura.
//
// O editor, enquanto isso, sempre desenhou um quadrado. Estes testes
// prendem os dois lados: o HTML não volta a soltar a altura, e a foto
// chega da CDN já no tamanho da caixa (o que é o que salva o Outlook,
// que ignora `max-height`).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

const semLinhas = { data: [], error: null }
const construtor: any = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      return () => construtor
    },
  }
)
// Qualquer consulta devolve vazio: o bloco cai no caminho de reserva,
// que monta os itens a partir do próprio evento — que é justamente o
// caso do gatilho de checkout abandonado.
const tabela = () => ({
  select: () => tabela(),
  eq: () => tabela(),
  in: () => tabela(),
  or: () => tabela(),
  limit: () => tabela(),
  order: () => tabela(),
  maybeSingle: async () => ({ data: null, error: null }),
  single: async () => ({ data: null, error: null }),
  then: (r: any) => Promise.resolve(semLinhas).then(r),
})

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: () => tabela(), rpc: async () => semLinhas },
}))

const { resolveCartBlocks } = await import('../render')

const FOTO =
  'https://cdn.shopify.com/s/files/1/0735/5455/9143/files/serum.jpg?v=1778872672'

function bloco(cfg: Record<string, any> = {}) {
  const json = encodeURIComponent(
    JSON.stringify({
      type: 'abandoned-cart',
      showImage: true,
      showName: true,
      showPrice: true,
      showButton: true,
      layoutType: 'image-left',
      imageWidth: 200,
      buttonText: 'Comprar agora',
      ...cfg,
    })
  )
  return `<!-- WORDER_CART_BLOCK:${json} -->`
}

const evento = {
  line_items: [
    {
      title: 'Doctor G. Award-Winning Hair Thickening Serum',
      price: '23.51',
      image_url: FOTO,
      product_id: '123',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a caixa da imagem no bloco do gatilho', () => {
  it('não solta a altura — era essa linha que esticava o frasco', async () => {
    const html = await resolveCartBlocks(bloco(), 'org-1', undefined, evento)
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toBeTruthy()
    // O par exato do defeito: uma largura fixa (não `max-width`) com a
    // altura livre. O `(?<!max-)` importa: sem ele, o próprio conserto
    // casaria, porque `max-width:200px` contém `width:200px`.
    expect(img).not.toMatch(/(?<!max-)width:\s*200px/)
    expect(img).toContain('max-height:200px')
  })

  it('limita os dois lados e deixa o navegador manter a proporção', async () => {
    const html = await resolveCartBlocks(bloco(), 'org-1', undefined, evento)
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toContain('max-width:200px')
    expect(img).toContain('max-height:200px')
    expect(img).toContain('width:auto')
    expect(img).toContain('height:auto')
  })

  it('pede a foto à Shopify já no tamanho da caixa — é o que o Outlook obedece', async () => {
    const html = await resolveCartBlocks(bloco(), 'org-1', undefined, evento)
    const src = html.match(/<img[^>]*src="([^"]+)"/)?.[1] || ''
    expect(src).toContain('width=400')
    expect(src).toContain('height=400')
    // Cortar decepa a tampa do frasco; encaixar preserva o produto.
    expect(src).not.toContain('crop=')
  })

  it('altura escolhida à mão manda na caixa', async () => {
    const html = await resolveCartBlocks(
      bloco({ imageWidth: 120, imageHeight: 300 }),
      'org-1',
      undefined,
      evento
    )
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toContain('max-width:120px')
    expect(img).toContain('max-height:300px')
  })

  it('no empilhado a largura é da coluna e a altura segue com teto', async () => {
    const html = await resolveCartBlocks(
      bloco({ layoutType: 'vertical' }),
      'org-1',
      undefined,
      evento
    )
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toContain('max-width:100%')
    expect(img).toContain('max-height:200px')
  })

  it('sem foto, o espaço reservado tem a mesma altura da caixa', async () => {
    const semFoto = { line_items: [{ title: 'Produto', price: '10.00' }] }
    const html = await resolveCartBlocks(bloco(), 'org-1', undefined, semFoto)
    expect(html).toContain('height:200px')
  })
})

describe('empilhar no celular', () => {
  it('a linha leva a classe que empilha — a opção existia e não saía no HTML', async () => {
    const html = await resolveCartBlocks(bloco(), 'org-1', undefined, evento)
    expect(html).toContain('worder-cart-stack')
  })

  it('quem desliga a opção não recebe a classe', async () => {
    const html = await resolveCartBlocks(
      bloco({ stackOnMobile: false }),
      'org-1',
      undefined,
      evento
    )
    expect(html).not.toContain('worder-cart-stack')
  })
})

describe('o que vem da loja entra escapado', () => {
  // Nome de produto, URL da foto e link do produto vêm da loja e entram
  // em atributo HTML. Um `Shampoo "Premium" & Co` fechava a aspa do
  // `alt` e corrompia a tag. A grade já escapava; a linha do gatilho
  // tinha ficado de fora.
  const hostil = {
    line_items: [{
      title: 'Shampoo "Premium" & Co',
      price: '10.00',
      image_url: 'https://cdn.shopify.com/s/files/1/x.jpg?v=1&a="b',
      product_id: '1',
    }],
  }

  it('aspa no nome não escapa do atributo', async () => {
    const html = await resolveCartBlocks(bloco(), 'org-1', undefined, hostil)
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toContain('&quot;Premium&quot;')
    expect(img).not.toMatch(/alt="[^"]*"Premium"/)
  })

  it('o & do nome sai como entidade no corpo', async () => {
    const html = await resolveCartBlocks(bloco(), 'org-1', undefined, hostil)
    expect(html).toContain('&amp; Co')
  })

  it('aspa na URL da foto não quebra o src', async () => {
    const html = await resolveCartBlocks(bloco(), 'org-1', undefined, hostil)
    const src = html.match(/<img[^>]*src="([^"]*)"/)?.[1] || ''
    // Aqui a aspa nem chega ao escape: `new URL()`, dentro do
    // redimensionamento, já a devolve como `%22`. O `&` é que vira
    // entidade, que é o certo para atributo HTML.
    expect(src).not.toContain('"')
    expect(src).toContain('%22')
    expect(src).toContain('&amp;')
  })
})
