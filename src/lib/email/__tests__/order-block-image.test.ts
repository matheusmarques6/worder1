// ═══════════════════════════════════════════════════════════════════
// A miniatura do resumo do pedido.
//
// O bloco desenha um quadrado de 80×80 e contava com `object-fit:cover`
// para a foto preencher sem deformar. O Outlook do Windows ignora
// `object-fit` e obedece os atributos `width`/`height` do HTML — que
// estavam os dois em 80. Resultado: uma foto alta de frasco era
// espremida para caber no quadrado e chegava achatada.
//
// A correção é pedir o recorte na origem: a CDN devolve o arquivo já
// quadrado, e aí os atributos passam a descrever a verdade em qualquer
// cliente.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { resolveOrderBlocks } from '../render'

const FOTO =
  'https://cdn.shopify.com/s/files/1/0735/5455/9143/files/serum.jpg?v=1778872672'

function bloco(cfg: Record<string, any> = {}) {
  const json = encodeURIComponent(
    JSON.stringify({ type: 'order-products', showImage: true, imageWidth: 80, ...cfg })
  )
  return `<!-- WORDER_ORDER_BLOCK:${json} -->`
}

const pedido = {
  currency: 'USD',
  line_items: [
    { title: 'Doctor G. Serum', price: '23.51', quantity: 1, image_url: FOTO },
  ],
}

describe('a miniatura do resumo do pedido', () => {
  it('vem recortada da CDN, e não espremida pelo cliente', () => {
    const html = resolveOrderBlocks(bloco(), pedido)
    const src = html.match(/<img[^>]*src="([^"]+)"/)?.[1] || ''
    expect(src).toContain('crop=center')
    // Dobro de 80, para tela retina.
    expect(src).toContain('width=160')
    expect(src).toContain('height=160')
  })

  it('o tamanho pedido acompanha a configuração', () => {
    const html = resolveOrderBlocks(bloco({ imageWidth: 120 }), pedido)
    const src = html.match(/<img[^>]*src="([^"]+)"/)?.[1] || ''
    expect(src).toContain('width=240')
    expect(src).toContain('height=240')
  })

  it('foto de outra CDN continua saindo, sem reescrita', () => {
    const outra = 'https://imagens.exemplo.com/p.jpg'
    const html = resolveOrderBlocks(bloco(), {
      ...pedido,
      line_items: [{ ...pedido.line_items[0], image_url: outra }],
    })
    expect(html).toContain(outra)
  })

  it('o quadrado do HTML continua declarado, que é o que o Outlook lê', () => {
    const html = resolveOrderBlocks(bloco(), pedido)
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toMatch(/width="80"/)
    expect(img).toMatch(/height="80"/)
  })
})
