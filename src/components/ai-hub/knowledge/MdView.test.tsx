import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MdView from './MdView'

describe('MdView', () => {
  it('mostra callouts com o rótulo do tipo e links como botões', () => {
    const html = renderToStaticMarkup(
      <MdView markdown={'# Trocas\n\n[!regra]\nNunca prometer prazo.\n\nVer [[Frete|o frete]] e **sempre** confirmar.'} />,
    )
    expect(html).toContain('Trocas')
    expect(html).toContain('Regra')
    expect(html).toContain('Nunca prometer prazo.')
    expect(html).toMatch(/<button[^>]*>o frete<\/button>/)
    expect(html).toContain('<b>sempre</b>')
  })

  it('nota vazia orienta a editar', () => {
    expect(renderToStaticMarkup(<MdView markdown="" />)).toContain('Nota vazia')
  })
})
