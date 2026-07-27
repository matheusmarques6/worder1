import { describe, it, expect } from 'vitest'
import {
  getHeaderFormat,
  getBodyText,
  countBodyVariables,
  getDynamicUrlButtonIndexes,
  buildTemplateComponents,
  TemplateComponentsError,
} from './template-components'

const imageTemplate = {
  components: [
    { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4::aW...'] } },
    { type: 'BODY', text: 'Oi {{1}}, seu pedido {{2}} saiu!' },
    { type: 'FOOTER', text: 'Loja X' },
  ],
}

const flatVideoTemplate = {
  header_type: 'video',
  header_media_url: 'https://cdn.exemplo.com/v.mp4',
  body_text: 'Oi {{1}}!',
  buttons: [],
}

const buttonTemplate = {
  components: [
    { type: 'BODY', text: 'Rastreie seu pedido' },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Ok' },
        { type: 'URL', text: 'Rastrear', url: 'https://loja.com/track/{{1}}' },
        { type: 'URL', text: 'Site', url: 'https://loja.com' },
      ],
    },
  ],
}

describe('getHeaderFormat', () => {
  it('le o format do componente HEADER (components JSONB)', () => {
    expect(getHeaderFormat(imageTemplate)).toBe('IMAGE')
  })
  it('cai para header_type achatado quando nao ha components', () => {
    expect(getHeaderFormat(flatVideoTemplate)).toBe('VIDEO')
    expect(getHeaderFormat({ header_type: 'text' })).toBe('TEXT')
  })
  it('retorna null sem header', () => {
    expect(getHeaderFormat({ body_text: 'oi' })).toBeNull()
    expect(getHeaderFormat({ header_type: 'none' })).toBeNull()
  })
})

describe('getBodyText / countBodyVariables', () => {
  it('prefere o texto do BODY em components, senao body_text', () => {
    expect(getBodyText(imageTemplate)).toBe('Oi {{1}}, seu pedido {{2}} saiu!')
    expect(getBodyText(flatVideoTemplate)).toBe('Oi {{1}}!')
  })
  it('conta variaveis posicionais', () => {
    expect(countBodyVariables('Oi {{1}} e {{ 2 }}')).toBe(2)
    expect(countBodyVariables('')).toBe(0)
    expect(countBodyVariables(null)).toBe(0)
  })
})

describe('getDynamicUrlButtonIndexes', () => {
  it('so retorna indices de botoes URL com {{n}} na url', () => {
    expect(getDynamicUrlButtonIndexes(buttonTemplate)).toEqual([1])
  })
  it('retorna [] sem botoes', () => {
    expect(getDynamicUrlButtonIndexes(imageTemplate)).toEqual([])
  })
})

describe('buildTemplateComponents', () => {
  it('header de imagem + 2 vars de body gera header e body na ordem', () => {
    const c = buildTemplateComponents(imageTemplate, {
      bodyVars: ['Ana', '123'],
      headerMediaUrl: 'https://cdn.exemplo.com/a.jpg',
    })
    expect(c).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.exemplo.com/a.jpg' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: '123' }] },
    ])
  })
  it('header de midia sem url lanca missing_header_media', () => {
    expect(() => buildTemplateComponents(imageTemplate, { bodyVars: ['Ana', '123'] }))
      .toThrowError(TemplateComponentsError)
    try {
      buildTemplateComponents(imageTemplate, { bodyVars: ['Ana', '123'] })
    } catch (e: any) {
      expect(e.code).toBe('missing_header_media')
    }
  })
  it('url nao-https lanca invalid_header_media', () => {
    try {
      buildTemplateComponents(imageTemplate, { bodyVars: ['a', 'b'], headerMediaUrl: 'http://x.com/a.jpg' })
      expect.unreachable()
    } catch (e: any) {
      expect(e.code).toBe('invalid_header_media')
    }
  })
  it('contagem errada de bodyVars lanca body_vars_mismatch', () => {
    try {
      buildTemplateComponents(flatVideoTemplate, { bodyVars: [], headerMediaUrl: 'https://x.com/v.mp4' })
      expect.unreachable()
    } catch (e: any) {
      expect(e.code).toBe('body_vars_mismatch')
    }
  })
  it('botao URL dinamico gera componente button com index original', () => {
    const c = buildTemplateComponents(buttonTemplate, { bodyVars: [], buttonVars: ['ABC123'] })
    expect(c).toEqual([
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'ABC123' }] },
    ])
  })
  it('buttonVars faltando lanca button_vars_mismatch', () => {
    try {
      buildTemplateComponents(buttonTemplate, { bodyVars: [] })
      expect.unreachable()
    } catch (e: any) {
      expect(e.code).toBe('button_vars_mismatch')
    }
  })
  it('template sem nada a parametrizar retorna []', () => {
    expect(buildTemplateComponents({ body_text: 'Ola!' }, { bodyVars: [] })).toEqual([])
  })
})
