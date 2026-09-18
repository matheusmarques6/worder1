// ═══════════════════════════════════════════════════════════════════
// A grade de produtos: o que o editor mostrava e o e-mail não mandava.
//
// O bloco "Produtos" deixa configurar o título e o layout. O HTML
// enviado ignorava os dois:
//
//   O título saía sempre `18px bold #111827 center`. Medido nos blocos
//   salvos: 88 de 126 têm cor de título diferente dessa, e 36 têm
//   título BRANCO — são os e-mails de fundo preto. Neles o cabeçalho
//   saía preto sobre preto, ou seja, não saía.
//
//   O layout "Lista" (uma coluna, foto pequena ao lado) desenhava lista
//   no editor e mandava a grade de colunas. 15 blocos salvos, 12 deles
//   em fluxo ativo.
//
// E havia o título órfão: ele ficava FORA do marcador, então quando o
// feed não devolvia produto a grade sumia e o título continuava — um
// "Recomendados Para Você" sozinho, com o vazio embaixo. 105 dos 126
// blocos têm título.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildProductGrid, productGridTitle } from '../product-grid'
import { renderDocumentToHtml } from '../render-html'

const FOTO = 'https://cdn.shopify.com/s/files/1/0735/serum.jpg?v=1'

const PRODUTOS = [
  { title: 'Serum', price: 23.51, image_url: FOTO, url: 'https://loja/p/serum' },
  { title: 'Shampoo', price: 19.9, image_url: FOTO, url: 'https://loja/p/shampoo' },
]

function documento(props: Record<string, any>) {
  return {
    version: 2,
    settings: { fontFamily: 'Arial, sans-serif', backgroundColor: '#ffffff', contentWidth: 600 },
    sections: [{
      id: 's1',
      styles: {},
      columns: [{ id: 'c1', blocks: [{ id: 'b1', type: 'product-grid', props }] }],
    }],
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('o título obedece ao que foi configurado', () => {
  it('cor branca sai branca — era ela que sumia no fundo preto', () => {
    const html = productGridTitle({ title: 'Recomendados', titleColor: '#ffffff' })
    expect(html).toContain('color:#ffffff')
    expect(html).not.toContain('#111827')
  })

  it('tamanho, peso e alinhamento também saem', () => {
    const html = productGridTitle({
      title: 'Para você', titleFontSize: 26, titleWeight: '500', titleAlign: 'left',
    })
    expect(html).toContain('font-size:26px')
    expect(html).toContain('font-weight:500')
    expect(html).toContain('text-align:left')
  })

  it('sem escolha, continua o que sempre foi', () => {
    const html = productGridTitle({ title: 'Recomendados' })
    expect(html).toContain('font-size:18px')
    expect(html).toContain('font-weight:bold')
    expect(html).toContain('color:#111827')
    expect(html).toContain('text-align:center')
  })

  it('sem título, não sai parágrafo nenhum', () => {
    expect(productGridTitle({ title: '' })).toBe('')
    expect(productGridTitle({})).toBe('')
  })

  it('o que vem do título entra escapado', () => {
    const html = productGridTitle({ title: 'Ofertas & <b>mais</b>' })
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>')
  })
})

describe('o título viaja com a grade, não sozinho', () => {
  it('na grade dinâmica ele entra no marcador', () => {
    const html = renderDocumentToHtml(documento({
      mode: 'dynamic', feedType: '', title: 'Recomendados Para Você',
      titleColor: '#ffffff', columns: 2, rows: 2,
      padding: { top: 20, right: 24, bottom: 20, left: 24 },
    }))
    // Fora do marcador não há título nenhum: é isso que o faz sumir
    // junto quando o feed volta vazio.
    const semMarcador = html.replace(/<!-- WORDER_PRODUCT_BLOCK:[^ ]*? -->/g, '')
    expect(semMarcador).not.toContain('Recomendados Para Você')
    // E dentro dele a configuração do título está inteira.
    const marcador = html.match(/<!-- WORDER_PRODUCT_BLOCK:([^ ]*?) -->/)?.[1] || ''
    const cfg = JSON.parse(decodeURIComponent(marcador))
    expect(cfg.title).toBe('Recomendados Para Você')
    expect(cfg.titleColor).toBe('#ffffff')
  })

  it('na grade estática ele sai junto dos produtos', () => {
    const html = renderDocumentToHtml(documento({
      mode: 'static', title: 'Escolhidos', titleColor: '#bf993f',
      columns: 2, rows: 1, staticProducts: PRODUTOS,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).toContain('Escolhidos')
    expect(html).toContain('color:#bf993f')
    expect(html).toContain('Serum')
  })
})

describe('layout em lista', () => {
  it('lista é uma coluna só, mesmo com `columns: 3`', () => {
    const html = buildProductGrid(PRODUTOS, { layout: 'list', cols: 3 })
    const celulas = (html.match(/worder-product-cell/g) || []).length
    expect(celulas).toBe(2) // um produto por linha, sem célula vazia
    expect(html).toContain('width="100%"')
  })

  it('a foto vira miniatura ao lado do texto', () => {
    const html = buildProductGrid(PRODUTOS, { layout: 'list', cols: 2 })
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toContain('width:80px')
    expect(img).toContain('height:80px')
    // Pedida à CDN já nesse tamanho — é o que o Outlook obedece.
    const src = img.match(/src="([^"]+)"/)?.[1] || ''
    expect(src).toContain('width=160')
    expect(src).toContain('height=160')
  })

  it('a grade normal segue em colunas, como sempre', () => {
    const html = buildProductGrid(PRODUTOS, { cols: 2 })
    const celulas = (html.match(/worder-product-cell/g) || []).length
    expect(celulas).toBe(2)
    const img = html.match(/<img[^>]*>/)?.[0] || ''
    expect(img).toContain('width:100%')
  })
})

describe('alinhamento do botão', () => {
  it('à esquerda sai à esquerda', () => {
    const html = buildProductGrid(PRODUTOS, { buttonAlign: 'left' })
    expect(html).toContain('margin:8px 0 0;')
  })

  it('à direita sai à direita', () => {
    const html = buildProductGrid(PRODUTOS, { buttonAlign: 'right' })
    expect(html).toContain('margin:8px 0 0 auto;')
  })

  it('sem escolha, continua centralizado', () => {
    const html = buildProductGrid(PRODUTOS, {})
    expect(html).toContain('margin:8px auto 0;')
  })
})

describe('separador entre produtos', () => {
  it('sai quando ligado, e não depois do último', () => {
    const tres = [...PRODUTOS, { title: 'Máscara', price: 9.9, image_url: FOTO, url: '#' }]
    const html = buildProductGrid(tres, { cols: 1, showSeparator: true, separatorColor: '#DDDDDD' })
    const traços = (html.match(/border-top:1px solid #DDDDDD/g) || []).length
    expect(traços).toBe(2) // três produtos, dois separadores
  })

  it('desligado, não sai nenhum', () => {
    const html = buildProductGrid(PRODUTOS, { cols: 1 })
    expect(html).not.toContain('border-top:1px solid')
  })
})
