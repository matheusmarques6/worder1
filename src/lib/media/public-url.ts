// =============================================================
// URL pública das imagens de e-mail — UMA fonte para todo o sistema
//
// As imagens moram no Supabase Storage (bucket email-images). Havia
// três jeitos de montar a URL delas:
//
//   /api/images/upload     → CDN (cdn.worder.email) + /render/image
//   /api/content/media     → <projeto>.supabase.co/storage/v1/object
//   rewriteImagesForEmail  → troca de host só na hora do envio
//
// A biblioteca de mídia e o seletor do editor usam a segunda, então o
// lojista via, colava e salvava em template uma URL do Supabase — a
// troca para a CDN só acontecia no envio, invisível para ele.
//
// Aqui fica a regra única:
//
//   host  = CDN_IMAGES_DOMAIN (cdn.worder.email), um CNAME proxied da
//           Cloudflare para o projeto Supabase. Toda imagem sai por ele;
//           o host do Supabase só aparece se a variável estiver vazia.
//   path  = /storage/v1/render/image/public/<bucket>/<arquivo>?width&quality
//           para JPG/PNG/WebP/AVIF — redimensiona para a largura do
//           e-mail e negocia WebP, cacheado na borda.
//           /storage/v1/object/public/<bucket>/<arquivo> para SVG e GIF —
//           o transformador não os processa (e um GIF perderia a
//           animação). Continuam saindo pela CDN, só sem transformar.
//
// Quem chama nunca monta URL de imagem à mão: usa buildMediaUrl para
// um caminho do storage e toCdnImageUrl para uma URL já existente.
// =============================================================

export const EMAIL_IMAGES_BUCKET = 'email-images'

/** Largura do canvas de e-mail: maior não ajuda, os clientes reduzem. */
export const EMAIL_IMAGE_WIDTH = 1200
export const EMAIL_IMAGE_QUALITY = 85

export interface MediaUrlOptions {
  bucket?: string
  width?: number
  quality?: number
}

/** Host da CDN configurado, sem protocolo nem barra final; null se ausente. */
export function cdnImagesHost(): string | null {
  const raw = process.env.CDN_IMAGES_DOMAIN
  if (!raw) return null
  const clean = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim()
  return clean || null
}

/** <ref>.supabase.co do projeto, tirado de NEXT_PUBLIC_SUPABASE_URL. */
export function supabaseStorageHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).host || null
  } catch {
    return null
  }
}

/** O host por onde as imagens saem: a CDN, senão o Supabase. */
export function mediaHost(): string | null {
  return cdnImagesHost() || supabaseStorageHost()
}

/**
 * O transformador de imagens não processa SVG nem GIF (o GIF perderia
 * a animação). Esses saem pelo caminho /object, ainda pela CDN.
 */
export function isTransformableImage(pathOrUrl: string): boolean {
  const clean = String(pathOrUrl || '').split(/[?#]/)[0].toLowerCase()
  return !/\.(svg|gif)$/.test(clean)
}

/**
 * URL pública de um arquivo do storage, já pela CDN.
 *
 *   buildMediaUrl('org/store_x/a.png') →
 *     https://cdn.worder.email/storage/v1/render/image/public/email-images/org/store_x/a.png?width=1200&quality=85
 *   buildMediaUrl('org/logo.svg') →
 *     https://cdn.worder.email/storage/v1/object/public/email-images/org/logo.svg
 *
 * Devolve '' quando não há host nenhum configurado — quem chama trata
 * como "sem URL", não monta link quebrado.
 */
export function buildMediaUrl(storagePath: string, opts: MediaUrlOptions = {}): string {
  const host = mediaHost()
  if (!host || !storagePath) return ''
  const bucket = opts.bucket || EMAIL_IMAGES_BUCKET
  const path = storagePath.replace(/^\/+/, '')
  return buildStorageUrl(host, `${bucket}/${path}`, opts)
}

function buildStorageUrl(host: string, bucketAndPath: string, opts: MediaUrlOptions): string {
  const encoded = bucketAndPath
    .split('/')
    .map((seg) => encodeURIComponent(decodeSafe(seg)))
    .join('/')
  if (!isTransformableImage(bucketAndPath)) {
    return `https://${host}/storage/v1/object/public/${encoded}`
  }
  const width = opts.width || EMAIL_IMAGE_WIDTH
  const quality = opts.quality || EMAIL_IMAGE_QUALITY
  return `https://${host}/storage/v1/render/image/public/${encoded}?width=${width}&quality=${quality}`
}

function decodeSafe(seg: string): string {
  try { return decodeURIComponent(seg) } catch { return seg }
}

// Qualquer URL de storage que já exista em template, campanha ou
// biblioteca: no host do Supabase ou na CDN, no caminho /object ou
// /render. Captura <bucket>/<arquivo> e a query.
const STORAGE_URL_RE =
  /https:\/\/([a-z0-9.-]+)\/storage\/v1\/(?:object|render\/image)\/public\/([^"'\s)?#]+)(\?[^"'\s)]*)?/gi

function isStorageHost(host: string): boolean {
  const h = host.toLowerCase()
  if (/^[a-z0-9-]+\.supabase\.co$/.test(h)) return true
  const cdn = cdnImagesHost()
  return Boolean(cdn && h === cdn.toLowerCase())
}

/**
 * Normaliza UMA URL de imagem do storage para a forma canônica: host
 * da CDN, /render para raster (com width/quality), /object para SVG e
 * GIF. URLs de outros lugares (Shopify, etc.) voltam intactas.
 */
export function toCdnImageUrl(url: string, opts: MediaUrlOptions = {}): string {
  if (!url) return url
  const re = new RegExp(STORAGE_URL_RE.source, 'i')
  const m = re.exec(url)
  if (!m || m.index !== 0) return url
  const [, host, bucketAndPath] = m
  if (!isStorageHost(host)) return url
  const target = mediaHost()
  if (!target) return url
  return buildStorageUrl(target, bucketAndPath, opts)
}

/**
 * Reescreve TODAS as URLs de storage dentro de um HTML para a forma
 * canônica. É o que roda no envio, para templates antigos que ainda
 * guardam o host do Supabase, e o que a biblioteca usa ao listar.
 */
export function rewriteStorageUrls(html: string, opts: MediaUrlOptions = {}): string {
  if (!html) return html
  const target = mediaHost()
  if (!target) return html
  return html.replace(STORAGE_URL_RE, (match, host: string, bucketAndPath: string) => {
    if (!isStorageHost(host)) return match
    return buildStorageUrl(target, bucketAndPath, opts)
  })
}
