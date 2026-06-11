// src/lib/ai/crawler.ts
// =============================================
// Crawler de sites para Knowledge Base (Frente A)
//
// DECISÃO DE PRODUTO (travada): SEM headless browser. Rodamos em serverless
// (maxDuration 60s); Playwright/Chromium custa >50MB de binário, cold start e
// dinheiro. Sites que exigem JavaScript (SPA) NÃO são suportados: detectamos
// honestamente (texto útil < MIN_USEFUL_CHARS) e falhamos com mensagem
// acionável — NUNCA marcamos a fonte como pronta com base vazia.
//
// Funções puras (testáveis sem rede): stripHtmlToText, extractSitemapUrls,
// extractInternalLinks. Orquestração com fetch: crawlSite.
// =============================================

export const MIN_USEFUL_CHARS = 200
export const MAX_SITEMAP_PAGES = 20
export const MAX_LINK_PAGES = 8
export const MAX_TOTAL_TEXT_CHARS = 300_000
export const PAGE_TIMEOUT_MS = 8_000
export const TOTAL_BUDGET_MS = 40_000
export const CRAWLER_USER_AGENT = 'WorderBot/1.0 (+https://worder.com; crawler para base de conhecimento)'

export const SPA_ERROR_MESSAGE =
  'Não foi possível extrair conteúdo desta URL: o site requer JavaScript para renderizar (SPA). ' +
  'Use o upload de arquivo ou a integração de produtos para alimentar a base de conhecimento.'

/** Remove script/style/nav/header/footer, tags e decodifica entidades comuns. */
export function stripHtmlToText(html: string): { title: string; text: string } {
  if (!html) return { title: '', text: '' }
  let work = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')

  const titleMatch = work.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : ''

  let text = work.replace(/<[^>]+>/g, ' ')
  text = decodeEntities(text).replace(/\s+/g, ' ').trim()
  return { title, text }
}

function decodeEntities(s: string): string {
  // &amp; DEVE ser decodificado por último — senão "&amp;lt;" viraria "<"
  // em vez de "&lt;" (double-decode).
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú').replace(/&atilde;/g, 'ã')
    .replace(/&otilde;/g, 'õ').replace(/&ccedil;/g, 'ç')
    .replace(/&#\d+;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Extrai <loc> de urlset OU sitemapindex. XML inválido/sem locs → []. */
export function extractSitemapUrls(xml: string): string[] {
  if (!xml || (!xml.includes('<urlset') && !xml.includes('<sitemapindex'))) return []
  const locs = [...xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)].map((m) => m[1].trim())
  return locs.filter((u) => /^https?:\/\//i.test(u))
}

const SKIP_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|ico|mp4|woff2?)(\?|$)/i

/** Links internos (mesmo hostname) absolutos, sem fragment, dedupados. */
export function extractInternalLinks(html: string, pageUrl: string): string[] {
  let base: URL
  try { base = new URL(pageUrl) } catch { return [] }
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const raw = m[1].trim()
    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue
    let u: URL
    try { u = new URL(raw, base) } catch { continue }
    if (u.hostname !== base.hostname) continue
    if (SKIP_EXTENSIONS.test(u.pathname)) continue
    u.hash = ''
    const normalized = u.toString()
    if (normalized === base.toString() || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

interface CrawlPageResult { url: string; title: string; text: string }

async function fetchPage(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': CRAWLER_USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

/** Busca o sitemap do domínio. sitemapindex: desce UM nível (primeiro filho). */
async function discoverSitemapUrls(origin: string): Promise<string[]> {
  try {
    const xml = await fetchPage(`${origin}/sitemap.xml`, 5_000)
    let urls = extractSitemapUrls(xml)
    if (urls.length > 0 && xml.includes('<sitemapindex')) {
      // urls são sitemaps filhos — busca o primeiro e usa as páginas dele
      const childXml = await fetchPage(urls[0], 5_000)
      urls = extractSitemapUrls(childXml)
    }
    return urls
  } catch {
    return []
  }
}

/**
 * Crawl multi-página: página inicial + (sitemap até MAX_SITEMAP_PAGES | links
 * internos até MAX_LINK_PAGES). Caps: PAGE_TIMEOUT_MS por página,
 * TOTAL_BUDGET_MS global, MAX_TOTAL_TEXT_CHARS de texto. Texto útil total
 * < MIN_USEFUL_CHARS → SPA_ERROR_MESSAGE (erro, nunca sucesso vazio).
 */
export async function crawlSite(rawUrl: string): Promise<string> {
  const start = Date.now()
  const rootUrl = new URL(rawUrl)
  const origin = rootUrl.origin

  let rootHtml: string
  try {
    rootHtml = await fetchPage(rootUrl.toString(), PAGE_TIMEOUT_MS)
  } catch (e: any) {
    throw new Error(`Erro ao acessar URL: ${e.message}`)
  }
  const rootPage = stripHtmlToText(rootHtml)
  const pages: CrawlPageResult[] = [{ url: rootUrl.toString(), ...rootPage }]

  // candidatas: sitemap → fallback links internos
  const sitemapUrls = await discoverSitemapUrls(origin)
  const sameHost = (u: string) => { try { return new URL(u).hostname === rootUrl.hostname } catch { return false } }
  const candidates =
    sitemapUrls.length > 0
      ? sitemapUrls.filter(sameHost).filter((u) => u !== rootUrl.toString()).slice(0, MAX_SITEMAP_PAGES)
      : extractInternalLinks(rootHtml, rootUrl.toString()).slice(0, MAX_LINK_PAGES)

  let totalChars = rootPage.text.length
  for (const url of candidates) {
    if (Date.now() - start > TOTAL_BUDGET_MS) break
    if (totalChars >= MAX_TOTAL_TEXT_CHARS) break
    try {
      const html = await fetchPage(url, PAGE_TIMEOUT_MS)
      const page = stripHtmlToText(html)
      if (page.text.length === 0) continue
      pages.push({ url, ...page })
      totalChars += page.text.length
    } catch {
      // página individual falhou: segue o crawl (best-effort)
    }
  }

  const combined = pages
    .map((p) => [p.title, p.text].filter(Boolean).join('\n\n'))
    .join('\n\n')
    .slice(0, MAX_TOTAL_TEXT_CHARS)

  if (combined.replace(/\s+/g, ' ').trim().length < MIN_USEFUL_CHARS) {
    throw new Error(SPA_ERROR_MESSAGE)
  }
  return combined
}
