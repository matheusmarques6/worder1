// ═══════════════════════════════════════════════════════════════════
// A grade de produtos: uma só, e igual à do editor.
//
// Existiam duas implementações. A do editor respeitava cor, raio, fonte
// e teto de altura; a do envio era laranja fixo, sem teto e com `R$`
// cravado. Quem montava um e-mail via uma coisa e enviava outra.
//
// O marcador do feed dinâmico também mudou de formato — passou a levar
// a configuração inteira. O formato antigo continua gravado no HTML de
// templates já salvos, então tem de continuar sendo lido: é o teste
// mais importante daqui, porque quebrá-lo apaga o feed de e-mails que
// já existem.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { buildProductGrid, formatMoney, productImageHeight } from '../product-grid'
import { parseProductBlockMarker } from '../render'
import { renderDocumentToHtml } from '../render-html'

const PROD = {
  title: 'Sérum',
  price: 23.51,
  compare_at_price: 41.08,
  image_url: 'https://cdn.shopify.com/s/files/1/0735/serum.jpg?v=1778872672',
  url: 'https://loja.com/serum',
}

describe('o marcador do feed', () => {
  it('lê o formato novo, com a configuração inteira', () => {
    const cfg = parseProductBlockMarker(
      encodeURIComponent(JSON.stringify({
        feedType: 'trigger_abandoned', maxProducts: 6, cols: 3,
        maxImageHeight: 180, priceColor: '#FF0000',
      }))
    )
    expect(cfg).toMatchObject({
      feedType: 'trigger_abandoned', maxProducts: 6, cols: 3,
      maxImageHeight: 180, priceColor: '#FF0000',
    })
  })

  it('ainda lê o formato antigo — é o que está salvo nos templates', () => {
    const cfg = parseProductBlockMarker('bestsellers:4:2:true:false:true:Comprar%20agora')
    expect(cfg).toMatchObject({
      feedType: 'bestsellers',
      maxProducts: 4,
      cols: 2,
      showPrice: true,
      showComparePrice: false,
      showButton: true,
      buttonText: 'Comprar agora',
    })
  })

  it('formato antigo com `false` nos booleanos é respeitado', () => {
    const cfg = parseProductBlockMarker('bestsellers:4:2:false:false:false:x')
    expect(cfg?.showPrice).toBe(false)
    expect(cfg?.showButton).toBe(false)
  })

  it('texto de botão com % sobrevive — uma decodificação, não duas', () => {
    // "Comprar já — 20% off" codificado. Decodificar o marcador inteiro
    // antes de separar por `:` estraga este caso: a primeira passada
    // devolve "20% off", e a segunda lê "% o" como escape malformado,
    // estoura, e o botão sai com o texto padrão.
    const cfg = parseProductBlockMarker(
      'bestsellers:2:2:true:true:true:' + encodeURIComponent('Comprar já — 20% off')
    )
    expect(cfg?.buttonText).toBe('Comprar já — 20% off')
  })

  it('marcador corrompido não derruba o envio', () => {
    expect(parseProductBlockMarker('{isso nao e json')).toBeNull()
    expect(parseProductBlockMarker('lixo')).toBeNull()
  })
})

describe('buildProductGrid', () => {
  it('a foto tem teto de altura — era o defeito do bloco do gatilho', () => {
    const html = buildProductGrid([PROD], { maxImageHeight: 220 })
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toContain('max-height:220px')
    // O par do defeito: largura 100% com altura livre.
    expect(img).not.toMatch(/width:100%;height:auto/)
  })

  it('pede a foto à CDN já no tamanho do cartão', () => {
    const html = buildProductGrid([PROD], { cols: 2, maxImageHeight: 220 })
    const src = html.match(/<img[^>]*src="([^"]+)"/)?.[1] || ''
    expect(src).toContain('width=')
    expect(src).toContain('height=440') // 220 × 2, para tela retina
    // Cartão de grade quer altura igual: aqui o corte é desejado.
    expect(src).toContain('crop=center')
  })

  it('usa a moeda da loja — antes cravava R$ mesmo em dólar', () => {
    const html = buildProductGrid([PROD], { currency: 'USD' })
    expect(html).toContain('$23.51')
    expect(html).not.toContain('R$ 23.51')
  })

  it('em real continua em real', () => {
    const html = buildProductGrid([PROD], { currency: 'BRL' })
    expect(html).toMatch(/R\$\s*23,51/)
  })

  it('respeita a cor e o raio configurados, em vez do laranja cravado', () => {
    const html = buildProductGrid([PROD], {
      priceColor: '#123456', productBorderRadius: 16, buttonColor: '#00FF00',
    })
    expect(html).toContain('#123456')
    expect(html).toContain('border-radius:16px')
    expect(html).toContain('#00FF00')
    expect(html).not.toContain('#F97316') // o laranja antigo
  })

  it('leva a classe que empilha os cartões no celular', () => {
    const html = buildProductGrid([PROD, PROD], { cols: 2 })
    expect(html).toContain('class="worder-product-grid"')
    expect(html).toContain('worder-product-cell')
  })

  it('completa a linha com células vazias em vez de deformar a grade', () => {
    // Três produtos em duas colunas: duas linhas, quatro células — a
    // última vazia. Contar `<tr>` não serve, porque o botão é uma
    // tabela aninhada e traz `<tr>` seu.
    const html = buildProductGrid([PROD, PROD, PROD], { cols: 2 })
    const celulas = html.match(/worder-product-cell/g) || []
    expect(celulas.length).toBe(4)
  })

  it('esconde o que foi desligado', () => {
    const html = buildProductGrid([PROD], { showButton: false, showPrice: false })
    expect(html).not.toContain('23,51')
    expect(html).not.toContain('Comprar')
  })

  it('sem produto nenhum não deixa tabela vazia no e-mail', () => {
    expect(buildProductGrid([], {})).toBe('')
  })

  it('escapa aspas do título em vez de quebrar o atributo', () => {
    const html = buildProductGrid([{ ...PROD, title: 'Sérum "forte"' }], {})
    expect(html).toContain('&quot;')
    expect(html).not.toMatch(/alt="Sérum "forte""/)
  })

  it('produto sem foto reserva a mesma altura, para o cartão não pular', () => {
    const html = buildProductGrid([{ ...PROD, image_url: null }], { maxImageHeight: 220 })
    expect(html).toContain('height:220px')
  })
})

describe('formatMoney', () => {
  it('cai no código da moeda quando ela é desconhecida', () => {
    expect(formatMoney(10, 'XYZ')).toContain('XYZ')
  })
  it('valor inválido vira zero em vez de NaN na tela', () => {
    expect(formatMoney('abc', 'USD')).toContain('0.00')
  })
})

describe('productImageHeight', () => {
  // O editor fazia essa conta e o envio não: "Retrato" aparecia alto na
  // tela e chegava quadrado na caixa de entrada.
  it('quadrado usa o teto como está', () => {
    expect(productImageHeight(300, 'square')).toBe(300)
  })
  it('retrato é mais alto', () => {
    expect(productImageHeight(300, 'portrait')).toBe(390)
  })
  it('paisagem é mais baixo', () => {
    expect(productImageHeight(300, 'landscape')).toBe(195)
  })
  it('sem proporção escolhida, quadrado', () => {
    expect(productImageHeight(undefined, undefined)).toBe(300)
  })
  it('a grade usa essa mesma conta', () => {
    const html = buildProductGrid([PROD], { maxImageHeight: 300, imageRatio: 'portrait' })
    expect(html).toContain('max-height:390px')
  })
})

describe('o laço fechado: o que o editor grava, o envio lê', () => {
  // Emissor e leitor moram em arquivos diferentes. Se o formato do
  // marcador mudar de um lado só, o feed some do e-mail sem erro
  // nenhum — é silencioso, que é o pior jeito de quebrar.
  it('o marcador gerado pelo editor volta com a configuração inteira', () => {
    const doc = {
      version: 2,
      settings: {},
      sections: [{
        id: 's1', columns: [{ id: 'c1', blocks: [{
          id: 'b1', type: 'product-grid',
          props: {
            feedType: 'recently_viewed', columns: 3, rows: 2,
            maxImageHeight: 180, imageRatio: 'portrait',
            priceColor: '#FF0000', buttonText: 'Comprar agora',
            staticProducts: [],
          },
        }] }],
      }],
    }
    const html = renderDocumentToHtml(doc)
    const marcador = html.match(/WORDER_PRODUCT_BLOCK:([^ ]*?) -->/)?.[1]
    expect(marcador).toBeTruthy()

    const cfg = parseProductBlockMarker(marcador!)
    expect(cfg).toMatchObject({
      feedType: 'recently_viewed',
      cols: 3,
      maxProducts: 6,
      maxImageHeight: 180,
      imageRatio: 'portrait',
      priceColor: '#FF0000',
      buttonText: 'Comprar agora',
    })
  })

  it('o marcador não carrega caractere que quebre o comentário HTML', () => {
    const doc = {
      version: 2, settings: {},
      sections: [{ id: 's1', columns: [{ id: 'c1', blocks: [{
        id: 'b1', type: 'product-grid',
        props: { buttonText: 'Compre --> já <script>', staticProducts: [] },
      }] }] }],
    }
    const html = renderDocumentToHtml(doc)
    const marcador = html.match(/WORDER_PRODUCT_BLOCK:([^ ]*?) -->/)?.[1]
    expect(marcador).toBeTruthy()
    expect(marcador).not.toContain('-->')
    expect(marcador).not.toContain('<')
    // E continua legível do outro lado.
    expect(parseProductBlockMarker(marcador!)?.buttonText).toBe('Compre --> já <script>')
  })
})

describe('documento malformado não derruba o envio', () => {
  // Uma seção sem `styles` chega de documento antigo, importado ou
  // montado por API. A leitura de `.hidden` num undefined estourava e
  // levava junto o render do e-mail inteiro — não só o da seção.
  it('seção sem styles ainda rende', () => {
    const doc = {
      version: 2, settings: {},
      sections: [{ id: 's1', columns: [{ id: 'c1', blocks: [
        { id: 'b1', type: 'text', props: { contentHtml: '<p>oi</p>' } },
      ] }] }],
    }
    expect(() => renderDocumentToHtml(doc)).not.toThrow()
    expect(renderDocumentToHtml(doc)).toContain('oi')
  })
})
