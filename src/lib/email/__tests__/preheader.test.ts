// ═══════════════════════════════════════════════════════════════════
// O texto de prévia — a segunda linha da caixa de entrada.
//
// O nó de e-mail do fluxo sempre teve o campo. 124 dos 141 nós salvos
// têm um escrito, TODOS em fluxo ativo, e são textos trabalhados:
// "I saved your cart + a 15% discount. Use code DISCOUNT15 at checkout."
// "{{first_name}}, unlock BACK15 for healthy hair (24h only)"
//
// Nenhum chegava ao HTML. Nem o executor nem o envio o passavam adiante,
// e nenhum template carrega `settings.preheaderText` que compensasse. O
// Gmail então preenchia a prévia com o começo do corpo.
//
// Depois do texto vem o enchimento de caracteres invisíveis. Sem ele, o
// cliente de e-mail completa a prévia com o que vier a seguir e o texto
// escrito com cuidado aparece grudado num pedaço de lixo. É o que
// Omnisend e Klaviyo também mandam.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { injectPreheader } from '../render'

const CORPO =
  '<html><head></head><body style="margin:0"><table><tr><td>Olá</td></tr></table></body></html>'

describe('o texto de prévia entra no topo do corpo', () => {
  it('logo depois do <body>, antes de qualquer conteúdo', () => {
    const html = injectPreheader(CORPO, '10% OFF is still active')
    const posPreheader = html.indexOf('10% OFF is still active')
    const posConteudo = html.indexOf('Olá')
    expect(posPreheader).toBeGreaterThan(-1)
    expect(posPreheader).toBeLessThan(posConteudo)
    expect(html.indexOf('<body')).toBeLessThan(posPreheader)
  })

  it('fica escondido de todo jeito que os clientes entendem', () => {
    const html = injectPreheader(CORPO, 'Prévia')
    const bloco = html.match(/<div style="display:none[^>]*>/)?.[0] || ''
    expect(bloco).toContain('display:none')
    expect(bloco).toContain('max-height:0')
    expect(bloco).toContain('overflow:hidden')
    expect(bloco).toContain('opacity:0')
    // O Outlook ignora quase tudo acima e obedece este.
    expect(bloco).toContain('mso-hide:all')
  })

  it('leva o enchimento que impede o corpo de vazar para a prévia', () => {
    const html = injectPreheader(CORPO, 'Prévia')
    const enchimentos = (html.match(/&zwnj;/g) || []).length
    expect(enchimentos).toBeGreaterThanOrEqual(50)
  })
})

describe('os casos de borda', () => {
  it('sem texto, o HTML sai intocado', () => {
    expect(injectPreheader(CORPO, '')).toBe(CORPO)
    expect(injectPreheader(CORPO, '   ')).toBe(CORPO)
  })

  it('o que o lojista digita entra escapado', () => {
    const html = injectPreheader(CORPO, 'Leve 2 & pague 1 <agora>')
    expect(html).toContain('Leve 2 &amp; pague 1 &lt;agora&gt;')
  })

  it('a variável atravessa inteira, para ser resolvida depois', () => {
    const html = injectPreheader(CORPO, '{{first_name}}, unlock BACK15')
    expect(html).toContain('{{first_name}}, unlock BACK15')
  })

  it('template que já tem o seu não ganha um segundo', () => {
    const comPreheader =
      '<html><body><div style="display:none;mso-hide:all;">Já tenho</div><p>Oi</p></body></html>'
    const html = injectPreheader(comPreheader, 'Outro')
    expect(html).not.toContain('Outro')
    expect(html).toContain('Já tenho')
  })

  it('fragmento sem <body> recebe o bloco na frente', () => {
    const html = injectPreheader('<table><tr><td>x</td></tr></table>', 'Prévia')
    expect(html.indexOf('Prévia')).toBeLessThan(html.indexOf('<table'))
  })
})
