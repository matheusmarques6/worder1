// ═══════════════════════════════════════════════════════════════════
// A foto do produto tem de caber na caixa.
//
// O bloco do gatilho mandava `width:200px;height:auto`, sem teto de
// altura. Foto de produto é alta e estreita — um frasco de sérum —,
// então 200px de largura viravam centenas de altura e o e-mail saía com
// um vidro gigante ao lado de duas linhas de texto. O editor desenhava
// um quadrado; o que chegava na caixa de entrada era outra coisa.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { fitProductImage, fitProductImageStyle } from '../product-image'

// Uma URL real da base, com o `v=` que a Shopify usa para furar cache.
const SHOPIFY =
  'https://cdn.shopify.com/s/files/1/0735/5455/9143/files/71_SJYygzrL._SL1500_8122dc01.jpg?v=1778872672'

describe('fitProductImage', () => {
  it('pede à Shopify a imagem já encaixada na caixa', () => {
    const u = new URL(fitProductImage(SHOPIFY, { width: 200, height: 200 }))
    // Dobro da caixa: nítido em tela retina.
    expect(u.searchParams.get('width')).toBe('400')
    expect(u.searchParams.get('height')).toBe('400')
  })

  it('não corta: sem `crop`, a Shopify encaixa em vez de decepar o frasco', () => {
    const u = new URL(fitProductImage(SHOPIFY, { width: 200, height: 200 }))
    expect(u.searchParams.get('crop')).toBeNull()
  })

  it('preserva o `v=`, que é o que fura o cache quando a foto muda', () => {
    const u = new URL(fitProductImage(SHOPIFY, { width: 200, height: 200 }))
    expect(u.searchParams.get('v')).toBe('1778872672')
  })

  it('caixa retangular vira pedido retangular', () => {
    const u = new URL(fitProductImage(SHOPIFY, { width: 120, height: 300 }))
    expect(u.searchParams.get('width')).toBe('240')
    expect(u.searchParams.get('height')).toBe('600')
  })

  it('não puxa arquivo gigante nem com caixa absurda', () => {
    const u = new URL(fitProductImage(SHOPIFY, { width: 5000, height: 5000 }))
    expect(Number(u.searchParams.get('width'))).toBeLessThanOrEqual(1600)
    expect(Number(u.searchParams.get('height'))).toBeLessThanOrEqual(1600)
  })

  it('imagem de outra CDN volta intacta — aí quem segura é o CSS', () => {
    const outra = 'https://images.exemplo.com/produto.jpg'
    expect(fitProductImage(outra, { width: 200, height: 200 })).toBe(outra)
  })

  it('URL quebrada ou vazia não vira lixo', () => {
    expect(fitProductImage('', { width: 200, height: 200 })).toBe('')
    expect(fitProductImage(null, { width: 200, height: 200 })).toBe('')
    expect(fitProductImage('/produto.jpg', { width: 200, height: 200 })).toBe('/produto.jpg')
  })
})

describe('fitProductImageStyle', () => {
  it('limita os dois lados e deixa o navegador manter a proporção', () => {
    const css = fitProductImageStyle({ width: 200, height: 200 })
    expect(css).toContain('max-width:200px')
    expect(css).toContain('max-height:200px')
    // O defeito era exatamente este par: largura travada, altura solta.
    expect(css).toContain('width:auto')
    expect(css).toContain('height:auto')
    expect(css).not.toContain('height:auto;max-height:none')
  })

  it('no empilhado a largura é da coluna, a altura continua com teto', () => {
    const css = fitProductImageStyle({ width: '100%', height: 240 })
    expect(css).toContain('max-width:100%')
    expect(css).toContain('max-height:240px')
  })

  it('centraliza o que sobra quando a foto é mais estreita que a caixa', () => {
    expect(fitProductImageStyle({ width: 200, height: 200 })).toContain('margin:0 auto')
  })
})

describe('a cor da barra de preenchimento', () => {
  // Sem `crop`, a Shopify devolve a caixa inteira e a diferença de
  // proporção vira barra em volta do produto. Em PNG ela é transparente
  // e some sozinha; em JPG, não — e um e-mail de fundo escuro ganha
  // duas faixas brancas ao lado do frasco.
  it('vai para a URL quando o bloco sabe o próprio fundo', () => {
    const u = new URL(fitProductImage(SHOPIFY, { width: 200, height: 200, padColor: '#101828' }))
    expect(u.searchParams.get('pad_color')).toBe('101828')
  })

  it('aceita hexadecimal de três dígitos', () => {
    const u = new URL(fitProductImage(SHOPIFY, { width: 200, height: 200, padColor: '#fff' }))
    expect(u.searchParams.get('pad_color')).toBe('fff')
  })

  it('cor inválida vira ausência, não parâmetro quebrado', () => {
    // Mandar `rgb(0,0,0)` faria a CDN recusar a transformação inteira e
    // devolver a foto sem tratamento — pior que não pedir cor nenhuma.
    for (const ruim of ['rgb(0,0,0)', 'preto', '#12', '', null, undefined]) {
      const u = new URL(fitProductImage(SHOPIFY, { width: 200, height: 200, padColor: ruim as any }))
      expect(u.searchParams.get('pad_color')).toBeNull()
    }
  })

  it('com corte não há barra, então a cor não é enviada', () => {
    const u = new URL(fitProductImage(SHOPIFY, { width: 200, height: 200, crop: true, padColor: '#fff' }))
    expect(u.searchParams.get('pad_color')).toBeNull()
    expect(u.searchParams.get('crop')).toBe('center')
  })
})
