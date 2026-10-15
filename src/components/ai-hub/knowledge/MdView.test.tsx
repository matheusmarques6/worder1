import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MdView from './MdView'

describe('MdView (formato do protótipo)', () => {
  it('mostra destaques com o rótulo do tipo, listas com marcador e links de nota', () => {
    const html = renderToStaticMarkup(
      <MdView markdown={'# Trocas\n\n[!regra]\nNunca prometer prazo.\n\n- Primeira troca grátis\n- Lacrado\n\nVer [[Frete|o frete]] e **sempre** confirmar.'}
        exists={(t) => t === 'Frete'} />,
    )
    expect(html).toContain('<h2')
    expect(html).toContain('kb-call')
    expect(html).toContain('Regra')
    expect(html).toContain('Nunca prometer prazo.')
    expect(html).toMatch(/<ul[^>]*><li>Primeira troca grátis<\/li>/)
    expect(html).toMatch(/<a[^>]*class="kb-wl"[^>]*>o frete<\/a>/)
    expect(html).toContain('<strong>sempre</strong>')
  })

  it('link para nota que não existe aparece como criar', () => {
    const html = renderToStaticMarkup(<MdView markdown="Ver [[Nova]]." exists={() => false} />)
    expect(html).toContain('kb-wl un')
  })

  it('nota vazia orienta a editar', () => {
    expect(renderToStaticMarkup(<MdView markdown="" />)).toContain('Nota vazia')
  })
})
