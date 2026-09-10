// O diagnóstico das imagens do e-mail.
//
// Uma imagem quebrada é a falha mais calada do sistema: o envio dá
// certo, o log diz enviado, e quem recebe vê retângulo vazio. As duas
// causas possíveis têm consertos diferentes — e opostos —, então o que
// importa aqui é não confundir uma com a outra.
import { describe, it, expect } from 'vitest'
import { classificarMedia } from '../probe'

const ok = (url: string) => ({ url, ok: true, status: 206 })
const falha = (url: string, status: number | null = 400) => ({ url, ok: false, status })

describe('classificação da sonda de imagens', () => {
  it('o caminho em uso responde: está tudo certo', () => {
    const v = classificarMedia({
      cdn_render: ok('https://cdn/render'),
      cdn_object: ok('https://cdn/object'),
    })
    expect(v.ok).toBe(true)
    expect(v.diagnostico).toBe('ok')
  })

  it('render falha e object serve: é o transformador que está desligado', () => {
    const v = classificarMedia({
      cdn_render: falha('https://cdn/render', 400),
      cdn_object: ok('https://cdn/object'),
      supabase_render: falha('https://sb/render', 400),
      supabase_object: ok('https://sb/object'),
    })
    expect(v.ok).toBe(false)
    expect(v.diagnostico).toBe('transformacao_desligada')
    expect(v.acao).toContain('CDN_IMAGE_TRANSFORM')
  })

  it('nada responde pela CDN e o Supabase serve: a CDN está fora', () => {
    const v = classificarMedia({
      cdn_render: falha('https://cdn/render', null),
      cdn_object: falha('https://cdn/object', null),
      supabase_render: ok('https://sb/render'),
      supabase_object: ok('https://sb/object'),
    })
    expect(v.diagnostico).toBe('cdn_fora')
    expect(v.acao).toContain('CDN_IMAGES_DOMAIN')
  })

  it('nenhum caminho responde: o storage está fora', () => {
    const v = classificarMedia({
      cdn_render: falha('https://cdn/render', null),
      cdn_object: falha('https://cdn/object', null),
      supabase_render: falha('https://sb/render', null),
      supabase_object: falha('https://sb/object', null),
    })
    expect(v.diagnostico).toBe('storage_fora')
  })

  it('sem sonda nenhuma não inventa diagnóstico', () => {
    expect(classificarMedia({}).diagnostico).toBe('sem_host')
  })
})
