// ═══════════════════════════════════════════════════════════════════
// Dinheiro na tela, na moeda da loja.
//
// A tela de automações anunciava "R$ 111,81" para uma venda de
// US$ 111,81, numa loja Shopify em dólar — ao lado de um painel que já
// mostrava "US$" certo. Mesmo número, moeda errada, duas telas
// discordando. O símbolo estava cravado no texto do formatador, e havia
// um formatador por página.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { formatarDinheiro, formatarDinheiroCurto } from '../money'

/** O que sai, sem os espaços que o Intl usa (NBSP e afins). */
const limpo = (s: string) => s.replace(/ | /g, ' ')

describe('a moeda é a da loja', () => {
  it('dólar sai como dólar — era este o caso do print', () => {
    const s = limpo(formatarDinheiro(111.81, 'USD'))
    expect(s).toContain('111,81')
    expect(s).not.toContain('R$')
    expect(s).toMatch(/US\$|\$/)
  })

  it('real continua saindo como real', () => {
    const s = limpo(formatarDinheiro(111.81, 'BRL'))
    expect(s).toContain('R$')
    expect(s).toContain('111,81')
  })

  it('euro também', () => {
    expect(limpo(formatarDinheiro(25.99, 'EUR'))).toContain('€')
  })

  it('sem moeda informada, o padrão continua sendo real', () => {
    expect(limpo(formatarDinheiro(10))).toContain('R$')
  })

  it('minúsculo funciona igual — a loja grava "usd"', () => {
    expect(limpo(formatarDinheiro(5, 'usd'))).not.toContain('R$')
  })
})

describe('os centavos aparecem', () => {
  it('sempre duas casas, para bater com o Shopify centavo a centavo', () => {
    expect(limpo(formatarDinheiro(34462.99, 'USD'))).toContain('34.462,99')
    expect(limpo(formatarDinheiro(24.9, 'USD'))).toContain('24,90')
  })
})

describe('o formato curto', () => {
  it('abaixo de mil, mostra por extenso', () => {
    expect(limpo(formatarDinheiroCurto(162.72, 'USD'))).toContain('162,72')
  })

  it('milhares levam o símbolo da loja, não o cravado', () => {
    const s = limpo(formatarDinheiroCurto(18270.15, 'USD'))
    expect(s).toContain('mil')
    expect(s).not.toContain('R$')
  })

  it('milhões também', () => {
    const s = limpo(formatarDinheiroCurto(2_400_000, 'USD'))
    expect(s).toContain('mi')
    expect(s).not.toContain('R$')
  })

  it('em real, segue com R$', () => {
    expect(limpo(formatarDinheiroCurto(18270.15, 'BRL'))).toContain('R$')
  })
})

describe('não quebra com entrada ruim', () => {
  it('código de moeda desconhecido mostra o código em vez de estourar', () => {
    const s = limpo(formatarDinheiro(10, 'XYZ123'))
    expect(s).toContain('XYZ123')
    expect(s).toContain('10,00')
  })

  it('valor inválido vira zero, não NaN na tela', () => {
    expect(limpo(formatarDinheiro(NaN, 'USD'))).toContain('0,00')
    expect(limpo(formatarDinheiro(Infinity, 'USD'))).toContain('0,00')
  })

  it('negativo continua negativo', () => {
    expect(limpo(formatarDinheiro(-25.99, 'USD'))).toContain('25,99')
    expect(limpo(formatarDinheiro(-25.99, 'USD'))).toContain('-')
  })
})
