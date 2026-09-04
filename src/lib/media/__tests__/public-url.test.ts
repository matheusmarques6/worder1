// =============================================================
// A URL das imagens de e-mail é a da CDN (cdn.worder.email) — nunca a
// do Supabase — e passa pelo transformador quando faz sentido.
// =============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildMediaUrl, toCdnImageUrl, rewriteStorageUrls, isTransformableImage, mediaHost,
} from '../public-url'
import { rewriteImagesForEmail } from '@/lib/email/image-rewrite'

const SB = 'https://rqpmoavktzvxfcfsdkcc.supabase.co'
const PATH = 'org-1/store_abc/1779769226218-2e2byy.png'

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SB
  process.env.CDN_IMAGES_DOMAIN = 'cdn.worder.email'
})
afterEach(() => {
  delete process.env.CDN_IMAGES_DOMAIN
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
})

describe('buildMediaUrl', () => {
  it('raster sai pela CDN, no transformador, com largura e qualidade', () => {
    expect(buildMediaUrl(PATH)).toBe(
      `https://cdn.worder.email/storage/v1/render/image/public/email-images/${PATH}?width=1200&quality=85`
    )
  })

  it('SVG e GIF saem pela CDN sem transformar (o GIF perderia a animação)', () => {
    expect(buildMediaUrl('org-1/logo.svg')).toBe('https://cdn.worder.email/storage/v1/object/public/email-images/org-1/logo.svg')
    expect(buildMediaUrl('org-1/anim.GIF')).toBe('https://cdn.worder.email/storage/v1/object/public/email-images/org-1/anim.GIF')
    expect(isTransformableImage('a.webp')).toBe(true)
    expect(isTransformableImage('a.svg?x=1')).toBe(false)
  })

  it('aceita CDN_IMAGES_DOMAIN colado com protocolo e barra', () => {
    process.env.CDN_IMAGES_DOMAIN = 'https://cdn.worder.email/'
    expect(mediaHost()).toBe('cdn.worder.email')
  })

  it('sem CDN configurada cai no host do Supabase — nunca fica sem URL', () => {
    delete process.env.CDN_IMAGES_DOMAIN
    expect(buildMediaUrl(PATH).startsWith('https://rqpmoavktzvxfcfsdkcc.supabase.co/storage/v1/render/image/public/email-images/')).toBe(true)
  })

  it('sem host nenhum devolve vazio, não "https:///"', () => {
    delete process.env.CDN_IMAGES_DOMAIN
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(buildMediaUrl(PATH)).toBe('')
  })

  it('largura e qualidade são configuráveis', () => {
    expect(buildMediaUrl(PATH, { width: 600, quality: 80 })).toContain('?width=600&quality=80')
  })
})

describe('toCdnImageUrl — uma URL que já existe', () => {
  it('URL crua do Supabase vira canônica da CDN', () => {
    expect(toCdnImageUrl(`${SB}/storage/v1/object/public/email-images/${PATH}`)).toBe(
      `https://cdn.worder.email/storage/v1/render/image/public/email-images/${PATH}?width=1200&quality=85`
    )
  })

  it('URL da CDN no caminho /object (template antigo) ganha o transformador', () => {
    expect(toCdnImageUrl(`https://cdn.worder.email/storage/v1/object/public/email-images/${PATH}`)).toContain('/render/image/public/')
  })

  it('URL do transformador com outra largura é normalizada', () => {
    expect(toCdnImageUrl(`${SB}/storage/v1/render/image/public/email-images/${PATH}?width=300&quality=50`, { width: 600, quality: 80 }))
      .toBe(`https://cdn.worder.email/storage/v1/render/image/public/email-images/${PATH}?width=600&quality=80`)
  })

  it('SVG no Supabase vai para a CDN no caminho /object', () => {
    expect(toCdnImageUrl(`${SB}/storage/v1/object/public/email-images/org-1/logo.svg`)).toBe(
      'https://cdn.worder.email/storage/v1/object/public/email-images/org-1/logo.svg'
    )
  })

  it('imagem de fora (Shopify) fica intacta', () => {
    const u = 'https://cdn.shopify.com/s/files/1/produto.jpg'
    expect(toCdnImageUrl(u)).toBe(u)
  })

  it('host de outro projeto Supabase também é normalizado; host desconhecido não', () => {
    expect(toCdnImageUrl(`https://outro.supabase.co/storage/v1/object/public/email-images/${PATH}`)).toContain('cdn.worder.email')
    const estranho = `https://exemplo.com/storage/v1/object/public/email-images/${PATH}`
    expect(toCdnImageUrl(estranho)).toBe(estranho)
  })
})

describe('rewriteStorageUrls / rewriteImagesForEmail — o HTML inteiro no envio', () => {
  it('troca todas as URLs de storage e deixa o resto em paz', () => {
    const html = `<img src="${SB}/storage/v1/object/public/email-images/${PATH}"> <img src="https://cdn.shopify.com/x.jpg"> <img src='https://cdn.worder.email/storage/v1/object/public/email-images/org-1/logo.svg'>`
    const out = rewriteImagesForEmail(html)
    expect(out).not.toContain('supabase.co')
    expect(out).toContain(`https://cdn.worder.email/storage/v1/render/image/public/email-images/${PATH}?width=600&quality=80`)
    expect(out).toContain('https://cdn.shopify.com/x.jpg')
    expect(out).toContain("https://cdn.worder.email/storage/v1/object/public/email-images/org-1/logo.svg'")
  })

  it('não repete a query nem duplica parâmetros quando a URL já tinha ?width', () => {
    const html = `<img src="${SB}/storage/v1/render/image/public/email-images/${PATH}?width=1200&quality=85">`
    const out = rewriteStorageUrls(html, { width: 600, quality: 80 })
    expect(out.match(/\?/g)?.length).toBe(1)
    expect(out).toContain('?width=600&quality=80"')
  })

  it('sem CDN configurada, ainda usa o transformador no host do Supabase', () => {
    delete process.env.CDN_IMAGES_DOMAIN
    const out = rewriteImagesForEmail(`<img src="${SB}/storage/v1/object/public/email-images/${PATH}">`)
    expect(out).toContain(`${SB}/storage/v1/render/image/public/email-images/${PATH}?width=600&quality=80`)
  })
})
