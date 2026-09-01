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

  it('&amp;lt; não causa double-decode (deve virar "&lt;" e não "<")', () => {
    const html = `<html><body><p>&amp;lt;tag&amp;gt; e R&amp;amp;D</p></body></html>`
    const { text } = stripHtmlToText(html)
    expect(text).toContain('&lt;')
    expect(text).toContain('&gt;')
    expect(text).toContain('&amp;')
    expect(text).not.toContain('<<')
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

// =============================================
// crawlSite — testes com fetch mockado
// =============================================
import { vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

import { lookup } from 'node:dns/promises'
import { crawlSite, SPA_ERROR_MESSAGE } from '../crawler'

const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

function htmlPage(body: string, title = 'T') {
  return `<html><head><title>${title}</title></head><body>${body}</body></html>`
}
const LONG = 'Produto excelente para o dia a dia com tecido confortável. '.repeat(10)

describe('crawlSite', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    // hostnames dos testes abaixo são todos "públicos" para o portão SSRF —
    // o que estas suítes exercitam é a lógica de crawl, não o guard (esse
    // tem suíte própria em ssrf-guard.test.ts).
    mockLookup.mockReset()
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })
  afterEach(() => { vi.unstubAllGlobals() })

  function respond(map: Record<string, { status?: number; body: string }>) {
    fetchMock.mockImplementation(async (input: any) => {
      const url = String(input)
      const hit = map[url]
      if (!hit) return new Response('not found', { status: 404 })
      return new Response(hit.body, { status: hit.status ?? 200 })
    })
  }

  it('usa sitemap.xml quando existe e concatena texto das páginas (mesmo domínio)', async () => {
    respond({
      'https://loja.com/': { body: htmlPage(LONG) },
      'https://loja.com/sitemap.xml': {
        body: `<urlset><url><loc>https://loja.com/p1</loc></url>
               <url><loc>https://outra.com/x</loc></url></urlset>`,
      },
      'https://loja.com/p1': { body: htmlPage('Página 1 com detalhes. ' + LONG) },
    })
    const text = await crawlSite('https://loja.com/')
    expect(text).toContain('Página 1')
    // página de outro domínio não foi buscada
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).not.toContain('https://outra.com/x')
  })

  it('sem sitemap → segue links internos da página inicial (cap)', async () => {
    respond({
      'https://loja.com/': { body: htmlPage(`<a href="/sobre">s</a>${LONG}`) },
      'https://loja.com/sitemap.xml': { status: 404, body: '' },
      'https://loja.com/sobre': { body: htmlPage('Sobre a loja. ' + LONG) },
    })
    const text = await crawlSite('https://loja.com/')
    expect(text).toContain('Sobre a loja')
  })

  it('SPA (texto útil < limiar) → lança SPA_ERROR_MESSAGE, nunca sucesso vazio', async () => {
    respond({
      'https://spa.com/': { body: '<html><body><div id="root"></div></body></html>' },
      'https://spa.com/sitemap.xml': { status: 404, body: '' },
    })
    await expect(crawlSite('https://spa.com/')).rejects.toThrow(SPA_ERROR_MESSAGE)
  })

  it('página inicial com erro HTTP → lança erro com status', async () => {
    respond({ 'https://down.com/': { status: 500, body: 'x' } })
    await expect(crawlSite('https://down.com/')).rejects.toThrow(/500/)
  })

  // item 18 do audit: SSRF — o portão (ssrf-guard.ts) tem suíte própria e
  // exaustiva; aqui só provamos que o crawlSite de ponta a ponta recusa e
  // que a mensagem que chega ao lojista é clara, não stack trace.
  it('URL apontando pro metadata endpoint da nuvem → recusa com mensagem clara', async () => {
    await expect(crawlSite('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /não pode ser usado como fonte/
    )
  })

  it('host público que redireciona para IP interno → recusa, nunca busca o destino', async () => {
    fetchMock.mockImplementation(async (input: any) => {
      const url = String(input)
      if (url === 'https://loja.com/') {
        return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
      }
      throw new Error(`fetch inesperado em teste: ${url}`)
    })
    await expect(crawlSite('https://loja.com/')).rejects.toThrow(/não pode ser usado como fonte/)
  })

  // fix round 1: `new URL(rawUrl)` estava fora do try — URL malformada
  // vazava um TypeError cru em inglês pro lojista em vez de mensagem clara.
  it('URL malformada → mensagem clara, não TypeError cru', async () => {
    await expect(crawlSite('não é uma url')).rejects.toThrow(/não pode ser usado como fonte/)
  })
})
