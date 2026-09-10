// O subdomínio dos links — o host que o destinatário VÊ.
//
// A ordem dos redirecionadores decide quem aparece: o provedor de envio
// reescreve cada link NO ENVIO, depois do nosso render. Então o host do
// e-mail é o dele, e o nosso /api/t/* fica no salto seguinte. Alinhar o
// host visível com o domínio de envio custa um CNAME — e é por isso que
// o subdomínio TEM de ser do próprio domínio do lojista.
import { describe, it, expect } from 'vitest'
import {
  subdominioDeLinksPadrao,
  validarSubdominioDeLinks,
  registroDeLinks,
} from '../tracking-subdomain'

describe('subdomínio de links', () => {
  it('o padrão é click.<domínio>', () => {
    expect(subdominioDeLinksPadrao('sualoja.com.br')).toBe('click.sualoja.com.br')
  })

  it('aceita um subdomínio do próprio domínio', () => {
    expect(validarSubdominioDeLinks('sualoja.com.br', 'links.sualoja.com.br'))
      .toEqual({ ok: true, valor: 'links.sualoja.com.br' })
  })

  it('tolera o que o lojista digita: espaço, maiúscula, esquema, barra final', () => {
    expect(validarSubdominioDeLinks('sualoja.com.br', '  HTTPS://Click.SuaLoja.com.br/  ').valor)
      .toBe('click.sualoja.com.br')
  })

  it('recusa domínio de fora — passaria no formato e morreria no DNS', () => {
    const v = validarSubdominioDeLinks('sualoja.com.br', 'click.outraloja.com.br')
    expect(v.ok).toBe(false)
    expect(v.erro).toContain('sualoja.com.br')
  })

  it('recusa o domínio raiz: o CNAME derrubaria o site', () => {
    expect(validarSubdominioDeLinks('sualoja.com.br', 'sualoja.com.br').ok).toBe(false)
  })

  it('vazio é válido e significa "volta ao padrão"', () => {
    expect(validarSubdominioDeLinks('sualoja.com.br', '')).toEqual({ ok: true, valor: '' })
  })

  it('acha o CNAME dos links no meio dos registros do provedor', () => {
    const registros = [
      { record: 'SPF', type: 'MX', name: 'send', value: 'feedback-smtp...' },
      { record: 'DKIM', type: 'TXT', name: 'resend._domainkey', value: 'p=MIG...' },
      { type: 'CNAME', name: 'click', value: 'tracking.resend.com', status: 'not_started' },
    ]
    expect(registroDeLinks(registros, 'click.sualoja.com.br'))
      .toEqual({ host: 'click.sualoja.com.br', valor: 'tracking.resend.com', status: 'not_started' })
  })

  it('sem subdomínio configurado, não há registro a cobrar', () => {
    expect(registroDeLinks([{ type: 'CNAME', name: 'click' }], null)).toBeNull()
  })
})
