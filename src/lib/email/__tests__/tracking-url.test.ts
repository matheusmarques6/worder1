// De qual host saem os links do e-mail. A ordem aqui é o contrato: o
// domínio da loja ganha do da organização, que ganha do padrão da
// plataforma, que ganha do host do painel — que só aparece quando nada
// mais foi configurado.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  normalizeTrackingDomain,
  platformTrackingBaseUrl,
  resolveTrackingBaseUrl,
} from '../tracking-url'

const APP = 'https://app.worder.com.br'
const PLATAFORMA = 'https://click.worder.com.br'

afterEach(() => { delete process.env.EMAIL_TRACKING_DOMAIN })

describe('normalização do domínio', () => {
  it('aceita o subdomínio puro e devolve https', () => {
    expect(normalizeTrackingDomain('links.sualoja.com.br')).toBe('https://links.sualoja.com.br')
  })

  it('tolera o que o lojista digita: espaço, maiúscula, esquema e caminho', () => {
    expect(normalizeTrackingDomain('  HTTPS://Links.SuaLoja.com.br/algo  ')).toBe('https://links.sualoja.com.br')
  })

  it('recusa o que não é domínio', () => {
    for (const ruim of ['', '   ', 'localhost', 'sem-ponto', 'http://', null, undefined, 42]) {
      expect(normalizeTrackingDomain(ruim as any)).toBeNull()
    }
  })
})

describe('padrão da plataforma', () => {
  it('vem do ambiente quando configurado', () => {
    process.env.EMAIL_TRACKING_DOMAIN = 'click.worder.com.br'
    expect(platformTrackingBaseUrl()).toBe(PLATAFORMA)
  })

  it('é nulo quando não há variável — e aí o host do painel é o último recurso', () => {
    expect(platformTrackingBaseUrl()).toBeNull()
  })
})

describe('ordem de resolução', () => {
  it('o domínio da loja ganha de todos', () => {
    expect(resolveTrackingBaseUrl({
      storeDomain: 'links.sualoja.com.br',
      orgDomain: 'links.daorg.com',
      platformDomain: PLATAFORMA,
      appBaseUrl: APP,
    })).toEqual({ url: 'https://links.sualoja.com.br', source: 'store' })
  })

  it('sem loja, vale o da organização', () => {
    expect(resolveTrackingBaseUrl({
      orgDomain: 'links.daorg.com',
      platformDomain: PLATAFORMA,
      appBaseUrl: APP,
    })).toEqual({ url: 'https://links.daorg.com', source: 'organization' })
  })

  it('sem nenhum dos dois, o padrão da plataforma — e NÃO o host do painel', () => {
    const r = resolveTrackingBaseUrl({ platformDomain: PLATAFORMA, appBaseUrl: APP })
    expect(r).toEqual({ url: PLATAFORMA, source: 'platform' })
    expect(r.url).not.toContain('app.worder')
  })

  it('o host do painel é o último recurso, para o link nunca sair relativo', () => {
    expect(resolveTrackingBaseUrl({ platformDomain: null, appBaseUrl: APP }))
      .toEqual({ url: APP, source: 'app' })
  })

  it('valor inválido na loja não bloqueia a organização', () => {
    expect(resolveTrackingBaseUrl({
      storeDomain: 'isso não é domínio',
      orgDomain: 'links.daorg.com',
      platformDomain: PLATAFORMA,
      appBaseUrl: APP,
    }).source).toBe('organization')
  })
})

// ── A rede de segurança do host quebrado ────────────────────────────
// Um CNAME apontado para o lugar errado (o subdomínio de rastreamento
// do provedor de envio, por exemplo) mata TODO clique de TODO e-mail.
// Quando a sonda já provou isso, o link passa a sair pelo domínio do
// app: feio e funcionando é melhor do que bonito e morto.
describe('host de links reprovado pela sonda', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { __limparCacheDoHostDeLinks } = await import('../tracking-host-probe-run')
    __limparCacheDoHostDeLinks()
  })

  afterEach(() => { vi.unstubAllGlobals() })

  async function baseDeLinks() {
    const { getTrackingBaseUrl, __resetTrackingUrlCache } = await import('../tracking-url')
    __resetTrackingUrlCache()
    return getTrackingBaseUrl('org-1', null)
  }

  it('enquanto não há veredito, o domínio configurado continua valendo', async () => {
    process.env.EMAIL_TRACKING_DOMAIN = 'click.worder.email'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })))
    expect(await baseDeLinks()).toBe('https://click.worder.email')
  })

  it('depois da sonda reprovar, os links saem pelo domínio do app', async () => {
    process.env.EMAIL_TRACKING_DOMAIN = 'click.worder.email'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })))
    const { verificarHostDeLinks } = await import('../tracking-host-probe-run')
    await verificarHostDeLinks('https://click.worder.email')
    expect(await baseDeLinks()).toBe(APP)
  })

  it('host que responde como Worder segue sendo usado', async () => {
    process.env.EMAIL_TRACKING_DOMAIN = 'link.worder.email'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ worder: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })))
    const { verificarHostDeLinks } = await import('../tracking-host-probe-run')
    await verificarHostDeLinks('https://link.worder.email')
    expect(await baseDeLinks()).toBe('https://link.worder.email')
  })
})
