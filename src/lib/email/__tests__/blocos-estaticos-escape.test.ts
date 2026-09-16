// ═══════════════════════════════════════════════════════════════════
// O que a pessoa digita no editor entra escapado no e-mail.
//
// O editor desenha esses campos como texto puro — um nome de empresa
// "Groot & Co" aparece assim na tela. No HTML enviado eles iam crus: o
// `&` virava entidade malformada e um `<...>` era engolido como tag.
// Pior nos atributos: uma aspa no endereço da imagem ou do link fecha
// o atributo no meio e corrompe a tag inteira.
//
// Três campos ficam de fora de propósito, porque neles o HTML É o
// conteúdo: o texto rico, o bloco HTML e o texto do bloco dividido.
// O teste do fim prende isso, para ninguém "consertar" depois.
//
// Nenhum valor salvo hoje tem esses caracteres — a conferência no banco
// deu zero. Estes testes são para o dia em que tiver.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { renderDocumentToHtml } from '../render-html'

function doc(...blocks: Array<{ type: string; props: Record<string, any> }>) {
  return {
    version: 2,
    settings: { fontFamily: 'Arial, sans-serif', backgroundColor: '#ffffff', contentWidth: 600 },
    sections: [{
      id: 's1', styles: {},
      columns: [{ id: 'c1', blocks: blocks.map((b, i) => ({ id: `b${i}`, ...b })) }],
    }],
  } as any
}

/** Nenhuma tag pode ter ficado aberta por uma aspa solta. */
function atributosIntactos(html: string) {
  for (const tag of html.match(/<(?:img|a)\b[^>]*>/g) || []) {
    const aspas = (tag.match(/"/g) || []).length
    expect(aspas % 2, `aspas ímpares em: ${tag}`).toBe(0)
  }
}

describe('botão', () => {
  it('o texto sai escapado e o link não quebra a tag', () => {
    const html = renderDocumentToHtml(doc({
      type: 'button',
      props: { text: 'Ver ofertas & novidades', href: 'https://loja/x?a="b&c=1' },
    }))
    expect(html).toContain('Ver ofertas &amp; novidades')
    expect(html).toContain('&quot;b')
    atributosIntactos(html)
  })

  it('variável de mesclagem atravessa inteira', () => {
    const html = renderDocumentToHtml(doc({
      type: 'button', props: { text: 'Rastrear Pedido', href: '{{tracking_url}}' },
    }))
    expect(html).toContain('href="{{tracking_url}}"')
    expect(html).toContain('>Rastrear Pedido<')
  })
})

describe('cabeçalho e rodapé', () => {
  it('aspa no endereço do logo não abre a tag', () => {
    const html = renderDocumentToHtml(doc({
      type: 'header',
      props: { logoSrc: 'https://cdn/x.png?v="1', logoHref: 'https://loja?a="b', logoWidth: 160 },
    }))
    atributosIntactos(html)
  })

  it('links do cabeçalho saem escapados', () => {
    const html = renderDocumentToHtml(doc({
      type: 'header',
      props: { logoSrc: 'https://cdn/x.png', showLinks: true, links: [{ text: 'Cabelo & Corpo', url: 'https://loja/c?a="b' }] },
    }))
    expect(html).toContain('Cabelo &amp; Corpo')
    atributosIntactos(html)
  })

  it('nome e endereço da empresa saem escapados', () => {
    const html = renderDocumentToHtml(doc({
      type: 'footer',
      props: { companyName: 'Groot & Co', address: 'Rua <Principal> 10', showUnsubscribe: true },
    }))
    expect(html).toContain('Groot &amp; Co')
    expect(html).toContain('Rua &lt;Principal&gt; 10')
    // O link de descadastro continua sendo a variável, não texto.
    expect(html).toContain('{{unsubscribe_url}}')
  })
})

describe('cupom, avaliação e tabela', () => {
  it('o código do cupom sai literal', () => {
    const html = renderDocumentToHtml(doc({
      type: 'coupon', props: { code: 'A&B<10>', headerText: 'Use & aproveite', footerText: '10% · 7 dias' },
    }))
    expect(html).toContain('A&amp;B&lt;10&gt;')
    expect(html).toContain('Use &amp; aproveite')
    expect(html).toContain('10% · 7 dias')
  })

  it('a citação e o autor saem escapados', () => {
    const html = renderDocumentToHtml(doc({
      type: 'review-quote', props: { quote: 'Melhor & mais barato', author: 'Ana <SP>', rating: 5 },
    }))
    expect(html).toContain('Melhor &amp; mais barato')
    expect(html).toContain('Ana &lt;SP&gt;')
  })

  it('as células da tabela saem escapadas e a variável passa', () => {
    const html = renderDocumentToHtml(doc({
      type: 'table',
      props: { data: [['Pedido & Data', '{{order_number}}'], ['Total <BRL>', 'R$ 10']], headerRow: true },
    }))
    expect(html).toContain('Pedido &amp; Data')
    expect(html).toContain('{{order_number}}')
    expect(html).toContain('Total &lt;BRL&gt;')
  })
})

describe('onde o HTML é o conteúdo, ele continua passando', () => {
  it('texto rico, bloco HTML e bloco dividido não são escapados', () => {
    const html = renderDocumentToHtml(doc(
      { type: 'text', props: { contentHtml: '<p><strong>Oi</strong> & tchau</p>' } },
      { type: 'html', props: { code: '<div class="meu">livre</div>' } },
      { type: 'split', props: { textHtml: '<h2>Destaque</h2>', imageSrc: 'https://cdn/x.png', showButton: false } },
    ))
    expect(html).toContain('<strong>Oi</strong>')
    expect(html).toContain('<div class="meu">livre</div>')
    expect(html).toContain('<h2>Destaque</h2>')
  })
})
