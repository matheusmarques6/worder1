// =============================================================
// A sonda de imagens: bate nos quatro caminhos e devolve o veredito.
//
// Roda no servidor (a CDN e o Supabase não respondem ao navegador com
// CORS para HEAD) e nunca lança: uma verificação que derruba a rota que
// a chama seria pior do que não verificar.
// =============================================================

import { EMAIL_IMAGES_BUCKET, cdnImagesHost, supabaseStorageHost } from './public-url'
import {
  classificarMedia,
  type MediaRota,
  type MediaVeredito,
  type SondaResultado,
  type SondasEmbutidas,
} from './probe'

const TIMEOUT_MS = 4000
const CACHE_TTL_MS = 5 * 60_000

/** A mesma largura que o envio pede, para sondar exatamente o que sai. */
const LARGURA_DE_TESTE = 600
const QUALIDADE_DE_TESTE = 80

export function urlsDeSonda(storagePath: string): Partial<Record<MediaRota, string>> {
  const caminho = `${EMAIL_IMAGES_BUCKET}/${String(storagePath).replace(/^\/+/, '')}`
    .split('/')
    .map((seg) => encodeURIComponent(decodeSafe(seg)))
    .join('/')
  const transformada = `?width=${LARGURA_DE_TESTE}&quality=${QUALIDADE_DE_TESTE}`

  const out: Partial<Record<MediaRota, string>> = {}
  const cdn = cdnImagesHost()
  if (cdn) {
    out.cdn_render = `https://${cdn}/storage/v1/render/image/public/${caminho}${transformada}`
    out.cdn_object = `https://${cdn}/storage/v1/object/public/${caminho}`
  }
  const sb = supabaseStorageHost()
  if (sb && sb !== cdn) {
    out.supabase_render = `https://${sb}/storage/v1/render/image/public/${caminho}${transformada}`
    out.supabase_object = `https://${sb}/storage/v1/object/public/${caminho}`
  }
  return out
}

function decodeSafe(seg: string): string {
  try { return decodeURIComponent(seg) } catch { return seg }
}

async function bater(url: string, extras: Record<string, string> = {}): Promise<SondaResultado> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    // GET com Range em vez de HEAD: o transformador do Supabase responde
    // 400 a HEAD mesmo quando funciona, e um HEAD "falso negativo" seria
    // pior do que não sondar.
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', Accept: 'image/*', ...extras },
      signal: ctrl.signal,
      cache: 'no-store',
    })
    return { url, ok: res.status < 400, status: res.status }
  } catch (e: any) {
    return { url, ok: false, status: null, erro: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) }
  } finally {
    clearTimeout(t)
  }
}

export interface SondaCompleta {
  sondas: Partial<Record<MediaRota, SondaResultado>>
  /** A mesma URL em uso, pedida como o proxy do Gmail e como outra página. */
  embutido?: SondasEmbutidas
  veredito: MediaVeredito
  amostra: string | null
}

// Os dois contextos que embutem a imagem NÃO pedem igual, e a diferença
// entre eles decide se o e-mail chegou vazio ou se só a nossa tela está
// mentindo (ver o cabeçalho de probe.ts):
//
//   proxy do Gmail  → User-Agent de robô, NENHUM Referer;
//   outra página    → Referer do site onde o e-mail está sendo mostrado.
const CABECALHO_DE_PROXY = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)',
  Accept: 'image/*',
}

const CABECALHO_DE_PAGINA = {
  Referer: 'https://exemplo-preview.test/emails/1',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Accept: 'image/avif,image/webp,image/*',
}

export async function sondarMedia(storagePath: string | null): Promise<SondaCompleta> {
  if (!storagePath) {
    return {
      sondas: {},
      veredito: {
        diagnostico: 'sem_imagens',
        ok: true,
        titulo: 'Nenhuma imagem para verificar',
        detalhe: 'Esta organização ainda não subiu imagem para o editor de e-mail.',
        acao: '',
      },
      amostra: null,
    }
  }

  const urls = urlsDeSonda(storagePath)
  const entradas = Object.entries(urls) as Array<[MediaRota, string]>
  const resultados = await Promise.all(entradas.map(([, url]) => bater(url)))

  const sondas: Partial<Record<MediaRota, SondaResultado>> = {}
  entradas.forEach(([rota], i) => { sondas[rota] = resultados[i] })

  // A URL que o e-mail realmente usa, agora nos dois contextos que embutem.
  const urlEmUso = urls.cdn_render || urls.supabase_render || urls.cdn_object || urls.supabase_object
  const embutido: SondasEmbutidas | undefined = urlEmUso
    ? {
        proxy: await bater(urlEmUso, CABECALHO_DE_PROXY),
        pagina: await bater(urlEmUso, CABECALHO_DE_PAGINA),
      }
    : undefined

  return { sondas, embutido, veredito: classificarMedia(sondas, embutido), amostra: storagePath }
}

// ── Cache: o host é o mesmo para toda a plataforma; sondar a cada
// carregamento de tela seria bater na CDN por nada.
let cache: { ts: number; valor: SondaCompleta } | null = null

export async function sondarMediaComCache(
  buscarCaminho: () => Promise<string | null>
): Promise<SondaCompleta | null> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.valor
  try {
    const caminho = await buscarCaminho()
    const valor = await sondarMedia(caminho)
    cache = { ts: Date.now(), valor }
    return valor
  } catch {
    return null
  }
}

export function __limparCacheDaSonda(): void {
  cache = null
}

/**
 * O caminho da imagem mais recente da organização. Os arquivos moram em
 * `<org>/<arquivo>` ou `<org>/store_<loja>/<arquivo>`; o list() do
 * storage não é recursivo, então descemos um nível quando o item é
 * pasta (pasta vem sem `id`).
 */
export async function imagemMaisRecenteDaOrg(admin: any, orgId: string): Promise<string | null> {
  const bucket = admin.storage.from(EMAIL_IMAGES_BUCKET)
  const ordem = { limit: 20, sortBy: { column: 'created_at', order: 'desc' as const } }

  const { data: raiz } = await bucket.list(orgId, ordem)
  const arquivo = (raiz || []).find((e: any) => e.id && !String(e.name).startsWith('.'))
  if (arquivo) return `${orgId}/${arquivo.name}`

  for (const pasta of (raiz || []).filter((e: any) => !e.id)) {
    const { data: dentro } = await bucket.list(`${orgId}/${pasta.name}`, ordem)
    const alvo = (dentro || []).find((e: any) => e.id && !String(e.name).startsWith('.'))
    if (alvo) return `${orgId}/${pasta.name}/${alvo.name}`
  }
  return null
}
