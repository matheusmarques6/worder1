// ═══════════════════════════════════════════════════════════════════
// A varredura: cruzar toda prop que o painel escreve com toda prop que
// os renderizadores leem.
//
// Sobraram dez. A maior de longe:
//
//   `feedId` NÃO viajava no marcador. A grade ligada a um feed salvo
//   perdia o vínculo no envio — os filtros, os produtos excluídos, a
//   reserva e a janela de tempo configurados no feed nunca eram
//   aplicados. Só a tela de pré-visualização passava o id adiante, o
//   que fazia a prévia mostrar uma coisa e o cliente receber outra.
//   Quatro grades salvas têm feed vinculado.
//
// As outras nove não tinham uso real ainda — eram armadilhas, não
// defeitos ao vivo. Estão aqui para não voltarem a ser.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { renderDocumentToHtml } from '../render-html'
import { buildProductGrid } from '../product-grid'

const FOTO = 'https://cdn.shopify.com/s/files/1/0735/x.jpg'

function doc(type: string, props: Record<string, any>) {
  return {
    version: 2,
    settings: { fontFamily: 'Arial, sans-serif', backgroundColor: '#fff', contentWidth: 600 },
    sections: [{ id: 's1', styles: {}, columns: [{ id: 'c1', blocks: [{ id: 'b1', type, props }] }] }],
  } as any
}

const marcador = (html: string) => {
  const m = html.match(/<!-- WORDER_PRODUCT_BLOCK:([^ ]*?) -->/)
  return m ? JSON.parse(decodeURIComponent(m[1])) : null
}

describe('o vínculo com o feed salvo chega ao envio', () => {
  it('o id do feed viaja no marcador', () => {
    const html = renderDocumentToHtml(doc('product-grid', {
      mode: 'dynamic', feedType: 'bestsellers', feedId: 'feed-abc', feedName: 'Meu feed',
      columns: 2, rows: 2, padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(marcador(html)?.feedId).toBe('feed-abc')
  })

  it('sem feed vinculado, segue vazio e não quebra', () => {
    const html = renderDocumentToHtml(doc('product-grid', {
      mode: 'dynamic', feedType: 'newest', columns: 2, rows: 2,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(marcador(html)?.feedId).toBe('')
  })
})

describe('modo da grade', () => {
  const tres = [{ title: 'A', price: 10, image_url: FOTO, url: '#' }]

  it('"produtos fixos" sem produto escolhido não vira dinâmico', () => {
    const html = renderDocumentToHtml(doc('product-grid', {
      mode: 'static', staticProducts: [], columns: 2, rows: 2,
      title: 'Escolhidos', padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).not.toContain('WORDER_PRODUCT_BLOCK')
    // E o título não fica sozinho.
    expect(html).not.toContain('Escolhidos')
  })

  it('"produtos fixos" com produto mostra o que foi escolhido', () => {
    const html = renderDocumentToHtml(doc('product-grid', {
      mode: 'static', staticProducts: tres, columns: 2, rows: 2,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).toContain('>A<')
    expect(html).not.toContain('WORDER_PRODUCT_BLOCK')
  })
})

describe('nome do produto como link', () => {
  const prods = [{ title: 'Sérum', price: 23.5, image_url: FOTO, url: 'https://loja/p/serum' }]

  it('ligado, o nome leva ao produto', () => {
    const html = buildProductGrid(prods, { nameLinkEnabled: true, nameColor: '#123456' })
    expect(html).toContain('<a href="https://loja/p/serum"')
    expect(html).toMatch(/<a href="https:\/\/loja\/p\/serum"[^>]*>Sérum<\/a>/)
    // A cor configurada manda, e sem sublinhado herdado.
    expect(html).toContain('color:#123456;text-decoration:none')
  })

  it('desligado, o nome é texto', () => {
    const html = buildProductGrid(prods, {})
    expect(html).not.toMatch(/<a[^>]*>Sérum<\/a>/)
    expect(html).toContain('Sérum')
  })
})

describe('imagem: largura total no mobile', () => {
  it('ligado, a imagem ganha a classe que a folha de estilo estica', () => {
    const html = renderDocumentToHtml(doc('image', {
      src: FOTO, width: 300, fullWidthMobile: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).toContain('worder-img-full-mobile')
    expect(html).toContain('.worder-img-full-mobile{width:100%!important')
  })

  it('sem a opção, nada muda — 1.176 imagens salvas seguem como estão', () => {
    const html = renderDocumentToHtml(doc('image', {
      src: FOTO, width: 300, padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).not.toContain('worder-img-full-mobile"')
  })
})

describe('os controles menores que não saíam', () => {
  it('altura máxima do logo no cabeçalho', () => {
    const html = renderDocumentToHtml(doc('header', {
      logoSrc: FOTO, logoWidth: 200, logoMaxHeight: 60,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).toContain('max-height:60px')
  })

  it('sombra do botão', () => {
    const comSombra = renderDocumentToHtml(doc('button', {
      text: 'Comprar', href: 'https://loja', shadow: { enabled: true },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(comSombra).toContain('box-shadow:')
    const sem = renderDocumentToHtml(doc('button', {
      text: 'Comprar', href: 'https://loja',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(sem).not.toContain('box-shadow:')
  })

  it('link da imagem no bloco dividido', () => {
    const html = renderDocumentToHtml(doc('split', {
      imageSrc: FOTO, imageHref: 'https://loja/campanha', textHtml: '<p>oi</p>', showButton: false,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).toContain('href="https://loja/campanha"')
  })

  it('texto do botão de play no vídeo', () => {
    const html = renderDocumentToHtml(doc('video', {
      videoUrl: 'https://youtu.be/x', thumbnailUrl: FOTO, playText: 'Assistir agora',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).toContain('Assistir agora')
    expect(html).toContain('href="https://youtu.be/x"')
  })

  it('sem texto de play, o vídeo sai como sempre saiu', () => {
    const html = renderDocumentToHtml(doc('video', {
      videoUrl: 'https://youtu.be/x', thumbnailUrl: FOTO,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }))
    expect(html).not.toContain('▶')
  })
})
