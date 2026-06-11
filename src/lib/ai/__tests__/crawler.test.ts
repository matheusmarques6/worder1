// src/lib/ai/__tests__/crawler.test.ts
// =============================================
// crawler.ts — testes das funções puras (sem rede)
// =============================================
import { describe, it, expect } from 'vitest'
import {
  stripHtmlToText,
  extractSitemapUrls,
  extractInternalLinks,
  MIN_USEFUL_CHARS,
} from '../crawler'

describe('stripHtmlToText', () => {
  it('remove script/style/nav/header/footer e tags, mantém texto e título', () => {
    const html = `<html><head><title>Loja X</title><style>.a{}</style></head>
      <body><nav>menu</nav><header>topo</header>
      <script>var x=1</script>
      <p>Camiseta b&aacute;sica &amp; shorts</p>
      <footer>rodape</footer></body></html>`
    const { title, text } = stripHtmlToText(html)
    expect(title).toBe('Loja X')
    expect(text).toContain('Camiseta')
    expect(text).toContain('&') // entidade decodificada
    expect(text).not.toContain('menu')
    expect(text).not.toContain('var x=1')
    expect(text).not.toContain('rodape')
  })

  it('html vazio → texto vazio', () => {
    expect(stripHtmlToText('').text).toBe('')
  })
})

describe('extractSitemapUrls', () => {
  it('parseia <urlset> e devolve locs', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://a.com/p1</loc></url>
      <url><loc>https://a.com/p2</loc></url></urlset>`
    expect(extractSitemapUrls(xml)).toEqual(['https://a.com/p1', 'https://a.com/p2'])
  })

  it('parseia <sitemapindex> devolvendo locs dos sitemaps filhos', () => {
    const xml = `<sitemapindex>
      <sitemap><loc>https://a.com/sitemap_products.xml</loc></sitemap></sitemapindex>`
    expect(extractSitemapUrls(xml)).toEqual(['https://a.com/sitemap_products.xml'])
  })

  it('xml inválido → []', () => {
    expect(extractSitemapUrls('not xml at all')).toEqual([])
  })
})

describe('extractInternalLinks', () => {
  it('resolve relativos, filtra outros domínios, dedup e remove fragments', () => {
    const html = `<a href="/sobre">s</a><a href="/sobre#x">s2</a>
      <a href="https://www.loja.com/faq">f</a>
      <a href="https://outra.com/x">fora</a>
      <a href="mailto:a@b.c">m</a><a href="/img/foto.jpg">img</a>`
    const links = extractInternalLinks(html, 'https://www.loja.com/')
    expect(links).toEqual(['https://www.loja.com/sobre', 'https://www.loja.com/faq'])
  })
})

describe('MIN_USEFUL_CHARS', () => {
  it('limiar de SPA é 200', () => {
    expect(MIN_USEFUL_CHARS).toBe(200)
  })
})
