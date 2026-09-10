// O bloco de produtos no envio de verdade.
//
// O editor guarda o texto do botão codificado dentro do marcador
// (encodeURIComponent, para o marcador não ter espaço). O preview do
// editor decodificava; o RENDER DO ENVIO não — e o e-mail que chegou ao
// cliente da Dr. Groot trazia "Buy%20now" escrito no botão.
//
// O mesmo marcador quebrava por inteiro quando o texto tinha hífen: o
// `[^-]` da expressão não casava, o bloco não era substituído e o
// e-mail saía sem produto nenhum, com um comentário HTML no lugar.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const PRODUTOS = [
  { title: 'Shampoo "Premium" & Co', price: '34.90', url: 'https://loja.com/p/1', image_url: 'https://loja.com/1.jpg' },
]

vi.mock('@/lib/email/product-feeds', () => ({
  resolveProductFeed: async () => PRODUTOS,
}))

function marcador(buttonText: string) {
  return `<!-- WORDER_PRODUCT_BLOCK:bestsellers:2:2:true:true:true:${encodeURIComponent(buttonText)} -->`
}

async function resolver(html: string) {
  const { resolveProductBlocks } = await import('../render')
  return resolveProductBlocks(html, 'org-1', undefined, undefined, null)
}

beforeEach(() => vi.resetModules())

describe('bloco de produtos no envio', () => {
  it('o botão sai com o texto legível, não codificado', async () => {
    const out = await resolver(marcador('Buy now'))
    expect(out).toContain('>Buy now</a>')
    expect(out).not.toContain('Buy%20now')
  })

  it('texto com hífen não faz o bloco inteiro sumir', async () => {
    const out = await resolver(marcador('Compre-agora'))
    expect(out).toContain('>Compre-agora</a>')
    expect(out).not.toContain('WORDER_PRODUCT_BLOCK')
  })

  it('acento e cedilha voltam inteiros', async () => {
    const out = await resolver(marcador('Comprar já — 20% off'))
    expect(out).toContain('Comprar já — 20% off')
  })

  it('aspas no nome do produto não quebram a tag', async () => {
    const out = await resolver(marcador('Comprar'))
    expect(out).toContain('&quot;Premium&quot;')
    expect(out).toContain('&amp; Co')
    expect(out).not.toMatch(/alt="[^"]*"Premium"/)
  })

  it('sem texto de botão cai no padrão', async () => {
    const out = await resolver('<!-- WORDER_PRODUCT_BLOCK:bestsellers:2:2:true:true:true: -->')
    expect(out).toContain('>Comprar</a>')
  })
})
